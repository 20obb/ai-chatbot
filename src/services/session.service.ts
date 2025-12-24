/**
 * =============================================================================
 * SESSION MANAGER SERVICE
 * =============================================================================
 * Manages user sessions with support for in-memory and Redis storage.
 * Handles conversation history, session expiration, and user preferences.
 */

import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  UserSession,
  Platform,
  UserRole,
  ConversationMessage,
  AppError,
  ErrorCode,
} from '../types';

/**
 * Session storage interface for abstraction
 */
interface SessionStorage {
  get(key: string): Promise<UserSession | null>;
  set(key: string, session: UserSession): Promise<void>;
  delete(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

/**
 * In-memory session storage implementation
 */
class InMemoryStorage implements SessionStorage {
  private sessions = new Map<string, UserSession>();

  async get(key: string): Promise<UserSession | null> {
    return this.sessions.get(key) || null;
  }

  async set(key: string, session: UserSession): Promise<void> {
    this.sessions.set(key, session);
  }

  async delete(key: string): Promise<void> {
    this.sessions.delete(key);
  }

  async getAllKeys(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }
}

/**
 * Redis session storage implementation (optional)
 */
class RedisStorage implements SessionStorage {
  private redis: import('ioredis').default | null = null;
  private readonly prefix = 'session:';

  constructor() {
    if (config.redisEnabled) {
      this.initRedis();
    }
  }

  private async initRedis(): Promise<void> {
    try {
      const Redis = (await import('ioredis')).default;
      this.redis = new Redis({
        host: config.redisHost,
        port: config.redisPort,
        password: config.redisPassword || undefined,
        db: config.redisDb,
      });

      this.redis.on('error', (err: Error) => {
        logger.error('Redis connection error', { error: err.message });
      });

      this.redis.on('connect', () => {
        logger.info('Connected to Redis');
      });
    } catch (error) {
      logger.error('Failed to initialize Redis', { error: (error as Error).message });
    }
  }

  async get(key: string): Promise<UserSession | null> {
    if (!this.redis) return null;
    const data = await this.redis.get(this.prefix + key);
    if (!data) return null;
    
    const session = JSON.parse(data);
    // Convert date strings back to Date objects
    session.createdAt = new Date(session.createdAt);
    session.lastActivityAt = new Date(session.lastActivityAt);
    session.rateLimitWindowStart = new Date(session.rateLimitWindowStart);
    session.conversationHistory = session.conversationHistory.map((msg: ConversationMessage) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
    
    return session;
  }

  async set(key: string, session: UserSession): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(
      this.prefix + key,
      JSON.stringify(session),
      'EX',
      config.sessionTimeoutSeconds
    );
  }

  async delete(key: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(this.prefix + key);
  }

  async getAllKeys(): Promise<string[]> {
    if (!this.redis) return [];
    const keys = await this.redis.keys(this.prefix + '*');
    return keys.map((k: string) => k.replace(this.prefix, ''));
  }
}

/**
 * Session Manager Service
 * Singleton service for managing user sessions
 */
export class SessionManager {
  private static instance: SessionManager;
  private storage: SessionStorage;

  private constructor() {
    // Use Redis if enabled, otherwise use in-memory storage
    if (config.redisEnabled) {
      this.storage = new RedisStorage();
      logger.info('Using Redis for session storage');
    } else {
      this.storage = new InMemoryStorage();
      logger.info('Using in-memory session storage');
    }

    // Start cleanup interval for expired sessions
    setInterval(() => this.cleanupExpiredSessions(), 60000); // Every minute
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Generate session key from platform and user ID
   */
  private getSessionKey(platform: Platform, userId: string): string {
    return `${platform}:${userId}`;
  }

  /**
   * Get or create a session for a user
   */
  public async getOrCreateSession(
    platform: Platform,
    userId: string,
    userName?: string
  ): Promise<UserSession> {
    const key = this.getSessionKey(platform, userId);
    let session = await this.storage.get(key);

    if (session) {
      // Check if session has expired
      const now = new Date();
      const sessionAge = (now.getTime() - session.lastActivityAt.getTime()) / 1000;
      
      if (sessionAge > config.sessionTimeoutSeconds) {
        logger.info('Session expired, creating new session', { userId, platform });
        await this.storage.delete(key);
        session = null;
      } else {
        // Update last activity
        session.lastActivityAt = now;
        await this.storage.set(key, session);
      }
    }

    if (!session) {
      // Create new session
      session = this.createNewSession(platform, userId);
      await this.storage.set(key, session);
      logger.info('Created new session', { userId, platform, sessionId: session.sessionId });
    }

    return session;
  }

  /**
   * Create a new session object
   */
  private createNewSession(platform: Platform, userId: string): UserSession {
    const now = new Date();
    const isAdmin = config.adminUserIds.includes(userId);

    return {
      sessionId: uuidv4(),
      userId,
      platform,
      role: isAdmin ? 'admin' : 'user',
      conversationHistory: [],
      createdAt: now,
      lastActivityAt: now,
      messageCount: 0,
      rateLimitWindowStart: now,
    };
  }

  /**
   * Update a session
   */
  public async updateSession(session: UserSession): Promise<void> {
    const key = this.getSessionKey(session.platform, session.userId);
    session.lastActivityAt = new Date();
    await this.storage.set(key, session);
  }

  /**
   * Add a message to conversation history
   */
  public async addMessage(
    session: UserSession,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    // Trim history if it exceeds maximum
    if (session.conversationHistory.length > config.maxConversationHistory) {
      session.conversationHistory = session.conversationHistory.slice(-config.maxConversationHistory);
    }

    await this.updateSession(session);
  }

  /**
   * Clear conversation history for a session
   */
  public async clearHistory(session: UserSession): Promise<void> {
    session.conversationHistory = [];
    await this.updateSession(session);
    logger.info('Cleared conversation history', {
      userId: session.userId,
      platform: session.platform,
    });
  }

  /**
   * Set custom system prompt for a user
   */
  public async setCustomPrompt(session: UserSession, prompt: string): Promise<void> {
    session.customSystemPrompt = prompt;
    await this.updateSession(session);
    logger.info('Set custom system prompt', {
      userId: session.userId,
      platform: session.platform,
    });
  }

  /**
   * Set model override for a user
   */
  public async setModelOverride(
    session: UserSession,
    model: string
  ): Promise<void> {
    session.modelOverride = model;
    await this.updateSession(session);
    logger.info('Set model override', {
      userId: session.userId,
      platform: session.platform,
      model,
    });
  }

  /**
   * Get the effective system prompt for a session
   */
  public getEffectiveSystemPrompt(session: UserSession): string {
    return session.customSystemPrompt || config.defaultSystemPrompt;
  }

  /**
   * Delete a session
   */
  public async deleteSession(platform: Platform, userId: string): Promise<void> {
    const key = this.getSessionKey(platform, userId);
    await this.storage.delete(key);
    logger.info('Deleted session', { userId, platform });
  }

  /**
   * Check if a user is an admin
   */
  public isAdmin(session: UserSession): boolean {
    return session.role === 'admin';
  }

  /**
   * Check if a user is whitelisted (when whitelist mode is enabled)
   */
  public isWhitelisted(userId: string): boolean {
    if (!config.whitelistEnabled) return true;
    return config.whitelistedUserIds.includes(userId) || config.adminUserIds.includes(userId);
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const keys = await this.storage.getAllKeys();
      const now = new Date();

      for (const key of keys) {
        const session = await this.storage.get(key);
        if (session) {
          const sessionAge = (now.getTime() - session.lastActivityAt.getTime()) / 1000;
          if (sessionAge > config.sessionTimeoutSeconds) {
            await this.storage.delete(key);
            logger.debug('Cleaned up expired session', { sessionId: session.sessionId });
          }
        }
      }
    } catch (error) {
      logger.error('Error cleaning up expired sessions', { error: (error as Error).message });
    }
  }
}

// Export singleton instance
export const sessionManager = SessionManager.getInstance();
