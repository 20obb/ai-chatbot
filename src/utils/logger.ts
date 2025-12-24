/**
 * =============================================================================
 * LOGGER SERVICE
 * =============================================================================
 * Centralized logging using Winston with support for multiple transports.
 * Provides structured logging with timestamps, levels, and context.
 */

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Ensure logs directory exists
const logsDir = path.dirname(config.logFilePath);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom log format with timestamp and structured data
 */
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info: winston.Logform.TransformableInfo) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

/**
 * Console format with colors for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf((info: winston.Logform.TransformableInfo) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

/**
 * Create Winston logger instance
 */
export const logger = winston.createLogger({
  level: config.logLevel,
  format: customFormat,
  defaultMeta: { service: 'ai-chatbots' },
  transports: [
    // File transport for all logs
    new winston.transports.File({
      filename: config.logFilePath,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// Add console transport in development
if (config.nodeEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
} else {
  // In production, still log to console but with JSON format
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

/**
 * Log conversation messages (only if enabled)
 */
export function logConversation(
  platform: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string
): void {
  if (!config.logConversations) return;
  
  // Truncate content for logging
  const truncatedContent = content.length > 500 
    ? content.substring(0, 500) + '...' 
    : content;
  
  logger.info('Conversation', {
    platform,
    userId: hashUserId(userId), // Hash user ID for privacy
    role,
    contentLength: content.length,
    contentPreview: truncatedContent,
  });
}

/**
 * Hash user ID for privacy in logs
 */
function hashUserId(userId: string): string {
  // Simple hash for privacy - in production, use a proper hashing algorithm
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `user_${Math.abs(hash).toString(16)}`;
}

export default logger;
