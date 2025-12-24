/**
 * =============================================================================
 * APPLICATION CONFIGURATION
 * =============================================================================
 * Centralized configuration management using environment variables.
 * All configuration is loaded and validated at startup.
 */

import dotenv from 'dotenv';
import path from 'path';
import { AppConfig, PerplexityModel } from '../types';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Parse comma-separated string to array
 */
function parseCommaSeparated(value: string | undefined): string[] {
  if (!value || value.trim() === '') return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse integer from environment variable
 */
function parseInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse float from environment variable
 */
function parseFloat(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validate required environment variables
 */
function validateConfig(config: AppConfig): void {
  const errors: string[] = [];

  // Perplexity API key is required
  if (!config.perplexityApiKey || config.perplexityApiKey.startsWith('pplx-xxxx')) {
    errors.push('PERPLEXITY_API_KEY is required and must be a valid API key');
  }

  // At least one platform must be enabled
  if (!config.telegramEnabled && !config.whatsappEnabled) {
    errors.push('At least one platform (Telegram or WhatsApp) must be enabled');
  }

  // Telegram bot token is required if Telegram is enabled
  if (config.telegramEnabled && (!config.telegramBotToken || config.telegramBotToken === 'your-telegram-bot-token-here')) {
    errors.push('TELEGRAM_BOT_TOKEN is required when Telegram is enabled');
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
}

/**
 * Build application configuration from environment variables
 */
function buildConfig(): AppConfig {
  const config: AppConfig = {
    // Perplexity
    perplexityApiKey: process.env.PERPLEXITY_API_KEY || '',
    perplexityBaseUrl: process.env.PERPLEXITY_BASE_URL || 'https://api.perplexity.ai',
    
    // AI defaults
    defaultModel: (process.env.PERPLEXITY_DEFAULT_MODEL || 'sonar-pro') as PerplexityModel,
    defaultTemperature: parseFloat(process.env.PERPLEXITY_DEFAULT_TEMPERATURE, 0.7),
    defaultMaxTokens: parseInt(process.env.PERPLEXITY_DEFAULT_MAX_TOKENS, 4096),
    defaultSystemPrompt: process.env.DEFAULT_SYSTEM_PROMPT || 
      'You are a helpful, accurate, and friendly AI assistant. You provide clear, concise, and conversational answers. Be professional yet approachable.',
    returnCitations: parseBoolean(process.env.RETURN_CITATIONS, false),
    
    // Telegram
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramEnabled: parseBoolean(process.env.TELEGRAM_ENABLED, true),
    
    // WhatsApp
    whatsappEnabled: parseBoolean(process.env.WHATSAPP_ENABLED, true),
    whatsappSessionPath: process.env.WHATSAPP_SESSION_PATH || './data/whatsapp-session',
    
    // Redis
    redisEnabled: parseBoolean(process.env.REDIS_ENABLED, false),
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT, 6379),
    redisPassword: process.env.REDIS_PASSWORD || '',
    redisDb: parseInt(process.env.REDIS_DB, 0),
    
    // Security
    rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS, 20),
    rateLimitWindowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 60),
    adminUserIds: parseCommaSeparated(process.env.ADMIN_USER_IDS),
    whitelistEnabled: parseBoolean(process.env.WHITELIST_ENABLED, false),
    whitelistedUserIds: parseCommaSeparated(process.env.WHITELISTED_USER_IDS),
    
    // Session
    maxConversationHistory: parseInt(process.env.MAX_CONVERSATION_HISTORY, 20),
    sessionTimeoutSeconds: parseInt(process.env.SESSION_TIMEOUT_SECONDS, 86400),
    
    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
    logConversations: parseBoolean(process.env.LOG_CONVERSATIONS, false),
    logFilePath: process.env.LOG_FILE_PATH || './logs/app.log',
    
    // Server
    serverPort: parseInt(process.env.SERVER_PORT, 3000),
    nodeEnv: process.env.NODE_ENV || 'development',
  };

  return config;
}

// Build and export configuration
export const config = buildConfig();

// Validate in production mode
if (config.nodeEnv === 'production') {
  validateConfig(config);
}

export default config;
