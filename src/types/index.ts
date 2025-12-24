/**
 * =============================================================================
 * TYPE DEFINITIONS
 * =============================================================================
 * Core type definitions for the multi-platform AI chatbot system.
 * These types ensure type safety across all services and adapters.
 */

// =============================================================================
// PLATFORM TYPES
// =============================================================================

/**
 * Supported messaging platforms
 */
export type Platform = 'telegram' | 'whatsapp';

/**
 * User roles for access control
 */
export type UserRole = 'user' | 'admin';

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Normalized message format used across all platforms
 * This abstraction allows the core AI logic to be platform-agnostic
 */
export interface NormalizedMessage {
  /** Unique message identifier */
  id: string;
  
  /** Source platform */
  platform: Platform;
  
  /** User identifier (platform-specific format) */
  userId: string;
  
  /** Chat/conversation identifier */
  chatId: string;
  
  /** Message content */
  content: string;
  
  /** Message timestamp */
  timestamp: Date;
  
  /** Original platform-specific message object (for debugging) */
  raw?: unknown;
  
  /** User display name (if available) */
  userName?: string;
  
  /** Whether this is a command message */
  isCommand?: boolean;
  
  /** Command name (if isCommand is true) */
  command?: string;
  
  /** Command arguments */
  commandArgs?: string[];
}

/**
 * Outgoing message to be sent to a platform
 */
export interface OutgoingMessage {
  /** Target chat identifier */
  chatId: string;
  
  /** Message content */
  content: string;
  
  /** Optional reply-to message ID */
  replyToMessageId?: string;
  
  /** Whether to parse markdown */
  parseMarkdown?: boolean;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

/**
 * Conversation message for history tracking
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * User session data
 */
export interface UserSession {
  /** Unique session identifier */
  sessionId: string;
  
  /** User identifier */
  userId: string;
  
  /** Platform the user is on */
  platform: Platform;
  
  /** User's role */
  role: UserRole;
  
  /** Conversation history */
  conversationHistory: ConversationMessage[];
  
  /** User-specific system prompt override (if set) */
  customSystemPrompt?: string;
  
  /** User-specific model override */
  modelOverride?: string;
  
  /** User-specific temperature override */
  temperatureOverride?: number;
  
  /** Session creation timestamp */
  createdAt: Date;
  
  /** Last activity timestamp */
  lastActivityAt: Date;
  
  /** Number of messages sent in current rate limit window */
  messageCount: number;
  
  /** Rate limit window start time */
  rateLimitWindowStart: Date;
}

// =============================================================================
// PERPLEXITY API TYPES
// =============================================================================

/**
 * Available Perplexity models
 */
export type PerplexityModel = 
  | 'sonar-pro'
  | 'sonar-reasoning'
  | 'sonar'
  | 'sonar-reasoning-pro';

/**
 * Perplexity API request message
 */
export interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Perplexity API request parameters
 */
export interface PerplexityRequest {
  model: PerplexityModel;
  messages: PerplexityMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
  return_citations?: boolean;
}

/**
 * Perplexity API response
 */
export interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * AI configuration parameters
 */
export interface AIConfig {
  model: PerplexityModel;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  requests: number;
  windowSeconds: number;
}

/**
 * Application configuration
 */
export interface AppConfig {
  // Perplexity
  perplexityApiKey: string;
  perplexityBaseUrl: string;
  
  // AI defaults
  defaultModel: PerplexityModel;
  defaultTemperature: number;
  defaultMaxTokens: number;
  defaultSystemPrompt: string;
  returnCitations: boolean;
  
  // Telegram
  telegramBotToken: string;
  telegramEnabled: boolean;
  
  // WhatsApp
  whatsappEnabled: boolean;
  whatsappSessionPath: string;
  
  // Redis
  redisEnabled: boolean;
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  redisDb: number;
  
  // Security
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
  adminUserIds: string[];
  whitelistEnabled: boolean;
  whitelistedUserIds: string[];
  
  // Session
  maxConversationHistory: number;
  sessionTimeoutSeconds: number;
  
  // Logging
  logLevel: string;
  logConversations: boolean;
  logFilePath: string;
  
  // Server
  serverPort: number;
  nodeEnv: string;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Custom error codes for the application
 */
export enum ErrorCode {
  // API Errors
  API_ERROR = 'API_ERROR',
  API_TIMEOUT = 'API_TIMEOUT',
  API_RATE_LIMITED = 'API_RATE_LIMITED',
  
  // Auth Errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_WHITELISTED = 'NOT_WHITELISTED',
  
  // Rate Limit Errors
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Validation Errors
  INVALID_INPUT = 'INVALID_INPUT',
  PROMPT_INJECTION = 'PROMPT_INJECTION',
  
  // Session Errors
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  
  // Platform Errors
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
}

/**
 * Custom application error
 */
export class AppError extends Error {
  public code: ErrorCode;
  public statusCode: number;
  public isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = 'AppError';
    
    // Capture stack trace if available (V8 engines)
    const captureStackTrace = (Error as { captureStackTrace?: (target: object, ctor: Function) => void }).captureStackTrace;
    if (captureStackTrace) {
      captureStackTrace(this, this.constructor);
    }
  }
}

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Bot command definition
 */
export interface BotCommand {
  command: string;
  description: string;
  adminOnly: boolean;
  handler: (message: NormalizedMessage, session: UserSession) => Promise<string>;
}

/**
 * Platform adapter interface
 * All platform adapters must implement this interface
 */
export interface PlatformAdapter {
  /** Platform identifier */
  platform: Platform;
  
  /** Initialize the adapter */
  initialize(): Promise<void>;
  
  /** Send a message to a chat */
  sendMessage(message: OutgoingMessage): Promise<void>;
  
  /** Shutdown the adapter gracefully */
  shutdown(): Promise<void>;
}
