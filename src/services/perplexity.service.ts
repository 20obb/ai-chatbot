/**
 * =============================================================================
 * PERPLEXITY API SERVICE
 * =============================================================================
 * Handles all communication with the Perplexity API.
 * Implements retry logic, error handling, and rate limiting.
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  PerplexityRequest,
  PerplexityResponse,
  PerplexityMessage,
  PerplexityModel,
  AppError,
  ErrorCode,
  ConversationMessage,
} from '../types';

/**
 * Perplexity API Service
 * Singleton service for interacting with the Perplexity API
 */
export class PerplexityService {
  private static instance: PerplexityService;
  private client: AxiosInstance;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // ms

  private constructor() {
    // Initialize axios client with Perplexity API configuration
    this.client = axios.create({
      baseURL: config.perplexityBaseUrl,
      timeout: 120000, // 120 second timeout for long responses
      headers: {
        'Authorization': `Bearer ${config.perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (requestConfig: InternalAxiosRequestConfig) => {
        logger.debug('Perplexity API request', {
          url: requestConfig.url,
          model: (requestConfig.data as PerplexityRequest)?.model,
        });
        return requestConfig;
      },
      (error: AxiosError) => {
        logger.error('Perplexity API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const data = response.data as PerplexityResponse;
        logger.debug('Perplexity API response', {
          model: data.model,
          tokens: data.usage?.total_tokens,
        });
        return response;
      },
      (error: AxiosError) => {
        const errorData = error.response?.data as { error?: { message?: string; type?: string } } | undefined;
        logger.error('Perplexity API response error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.message,
          code: error.code,
          errorType: errorData?.error?.type,
          errorMessage: errorData?.error?.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PerplexityService {
    if (!PerplexityService.instance) {
      PerplexityService.instance = new PerplexityService();
    }
    return PerplexityService.instance;
  }

  /**
   * Generate a chat completion from Perplexity API
   */
  public async chat(
    conversationHistory: ConversationMessage[],
    systemPrompt: string,
    options: {
      model?: PerplexityModel;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<{ content: string; citations?: string[]; usage: PerplexityResponse['usage'] }> {
    // Build messages array with system prompt and conversation history
    const messages: PerplexityMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    const request: PerplexityRequest = {
      model: options.model || config.defaultModel,
      messages,
      temperature: options.temperature ?? config.defaultTemperature,
      max_tokens: options.maxTokens ?? config.defaultMaxTokens,
      stream: false,
      // Only include return_citations if explicitly enabled
      ...(config.returnCitations && { return_citations: true }),
    };

    // Attempt request with retry logic
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.post<PerplexityResponse>(
          '/chat/completions',
          request
        );

        const data = response.data;
        let content = data.choices[0]?.message?.content || '';

        // Strip citation numbers like [1], [2], [1][2] from response when citations are disabled
        if (!config.returnCitations) {
          content = content.replace(/\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();
        }

        return {
          content,
          citations: config.returnCitations ? data.citations : undefined,
          usage: data.usage,
        };
      } catch (error) {
        lastError = error as Error;
        
        if (error instanceof AxiosError) {
          // Don't retry on client errors (4xx) except rate limiting
          if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
            if (error.response.status === 429) {
              // Rate limited - wait longer before retry
              logger.warn('Perplexity API rate limited, waiting before retry', { attempt });
              await this.sleep(this.retryDelay * attempt * 2);
              continue;
            }
            
            // Other client errors - don't retry
            throw this.mapError(error);
          }
        }

        // Server errors or network errors - retry with exponential backoff
        if (attempt < this.maxRetries) {
          const axiosErr = error as AxiosError;
          const errData = axiosErr.response?.data as { error?: { message?: string } } | undefined;
          logger.warn('Perplexity API error, retrying', {
            attempt,
            status: axiosErr.response?.status,
            code: axiosErr.code,
            error: errData?.error?.message || (error as Error).message,
          });
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    // All retries exhausted
    throw this.mapError(lastError);
  }

  /**
   * Map axios errors to application errors
   */
  private mapError(error: Error | null): AppError {
    if (!error) {
      return new AppError(ErrorCode.API_ERROR, 'Unknown API error', 500);
    }

    if (error instanceof AxiosError) {
      const status = error.response?.status || 500;
      const message = (error.response?.data as { error?: { message?: string } })?.error?.message || error.message;

      if (status === 429) {
        return new AppError(ErrorCode.API_RATE_LIMITED, 'API rate limit exceeded. Please try again later.', 429);
      }

      if (status === 401) {
        return new AppError(ErrorCode.UNAUTHORIZED, 'Invalid API key', 401);
      }

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return new AppError(ErrorCode.API_TIMEOUT, 'API request timed out. Please try again.', 504);
      }

      return new AppError(ErrorCode.API_ERROR, `API error: ${message}`, status);
    }

    return new AppError(ErrorCode.API_ERROR, error.message, 500);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate that the API key is working
   */
  public async validateApiKey(): Promise<boolean> {
    try {
      await this.chat(
        [{ role: 'user', content: 'Hi', timestamp: new Date() }],
        'You are a test assistant.',
        { maxTokens: 10 }
      );
      return true;
    } catch (error) {
      logger.error('API key validation failed', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Get available models
   */
  public getAvailableModels(): PerplexityModel[] {
    return ['sonar-pro', 'sonar-reasoning', 'sonar', 'sonar-reasoning-pro'];
  }
}

// Export singleton instance
export const perplexityService = PerplexityService.getInstance();
