/**
 * =============================================================================
 * TELEGRAM BOT ADAPTER
 * =============================================================================
 * Handles all Telegram-specific functionality including message reception,
 * command handling, and message sending.
 */

import TelegramBot from 'node-telegram-bot-api';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { messageHandler } from '../services/message.service';
import {
  NormalizedMessage,
  OutgoingMessage,
  Platform,
  PlatformAdapter,
} from '../types';

/**
 * Telegram Bot Adapter
 * Implements the PlatformAdapter interface for Telegram
 */
export class TelegramAdapter implements PlatformAdapter {
  public readonly platform: Platform = 'telegram';
  private bot: TelegramBot | null = null;
  private isRunning = false;

  /**
   * Initialize the Telegram bot
   */
  public async initialize(): Promise<void> {
    if (!config.telegramEnabled) {
      logger.info('Telegram bot is disabled');
      return;
    }

    if (!config.telegramBotToken) {
      logger.error('Telegram bot token not configured');
      return;
    }

    try {
      // Create bot instance with polling
      this.bot = new TelegramBot(config.telegramBotToken, {
        polling: {
          interval: 300,
          autoStart: true,
          params: {
            timeout: 10,
          },
        },
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Set bot commands
      await this.setBotCommands();

      this.isRunning = true;
      logger.info('Telegram bot initialized and polling');

      // Get bot info
      const botInfo = await this.bot.getMe();
      logger.info('Telegram bot connected', {
        username: botInfo.username,
        id: botInfo.id,
      });
    } catch (error) {
      logger.error('Failed to initialize Telegram bot', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Set up event handlers for the Telegram bot
   */
  private setupEventHandlers(): void {
    if (!this.bot) return;

    // Handle text messages
    this.bot.on('message', async (msg: TelegramBot.Message) => {
      // Ignore non-text messages
      if (!msg.text) return;

      try {
        await this.handleMessage(msg);
      } catch (error) {
        logger.error('Error handling Telegram message', {
          error: (error as Error).message,
          chatId: msg.chat.id,
        });
      }
    });

    // Handle polling errors
    this.bot.on('polling_error', (error: Error) => {
      logger.error('Telegram polling error', { error: error.message });
    });

    // Handle webhook errors
    this.bot.on('webhook_error', (error: Error) => {
      logger.error('Telegram webhook error', { error: error.message });
    });

    // Handle errors
    this.bot.on('error', (error: Error) => {
      logger.error('Telegram bot error', { error: error.message });
    });
  }

  /**
   * Set bot commands in Telegram
   */
  private async setBotCommands(): Promise<void> {
    if (!this.bot) return;

    const commands = [
      { command: 'start', description: 'Start the bot and show help' },
      { command: 'help', description: 'Show available commands' },
      { command: 'reset', description: 'Clear conversation history' },
      { command: 'preset', description: 'Use a prompt preset' },
      { command: 'model', description: 'View or change AI model' },
      { command: 'status', description: 'Check your session status' },
    ];

    try {
      await this.bot.setMyCommands(commands);
      logger.debug('Telegram bot commands set');
    } catch (error) {
      logger.warn('Failed to set Telegram bot commands', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle incoming Telegram message
   */
  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    if (!this.bot || !msg.text) return;

    const chatId = msg.chat.id.toString();
    const userId = msg.from?.id.toString() || chatId;

    // Show typing indicator
    await this.bot.sendChatAction(chatId, 'typing');

    // Normalize the message
    const normalizedMessage = this.normalizeMessage(msg);

    // Process the message through the message handler
    const response = await messageHandler.processMessage(normalizedMessage);

    // Send the response
    await this.sendMessage({
      chatId,
      content: response.content,
      replyToMessageId: msg.message_id.toString(),
      parseMarkdown: true,
    });
  }

  /**
   * Normalize Telegram message to standard format
   */
  private normalizeMessage(msg: TelegramBot.Message): NormalizedMessage {
    const text = msg.text || '';
    const isCommand = text.startsWith('/');
    
    let command: string | undefined;
    let commandArgs: string[] = [];
    let content = text;

    if (isCommand) {
      const parts = text.slice(1).split(/\s+/);
      // Remove @botname from command if present
      command = parts[0].split('@')[0].toLowerCase();
      commandArgs = parts.slice(1);
      content = commandArgs.join(' ');
    }

    return {
      id: msg.message_id.toString(),
      platform: 'telegram',
      userId: msg.from?.id.toString() || msg.chat.id.toString(),
      chatId: msg.chat.id.toString(),
      content: isCommand ? content : text,
      timestamp: new Date(msg.date * 1000),
      raw: msg,
      userName: msg.from?.username || msg.from?.first_name,
      isCommand,
      command,
      commandArgs,
    };
  }

  /**
   * Send a message to a Telegram chat
   */
  public async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.bot) {
      logger.error('Cannot send message: Telegram bot not initialized');
      return;
    }

    try {
      const options: TelegramBot.SendMessageOptions = {};

      // Enable markdown parsing if requested
      if (message.parseMarkdown) {
        options.parse_mode = 'Markdown';
      }

      // Reply to specific message if specified
      if (message.replyToMessageId) {
        options.reply_to_message_id = parseInt(message.replyToMessageId, 10);
      }

      // Split long messages if needed (Telegram limit is 4096 characters)
      const chunks = this.splitMessage(message.content, 4000);

      for (const chunk of chunks) {
        try {
          await this.bot.sendMessage(message.chatId, chunk, options);
        } catch (error) {
          // If markdown parsing fails, try without markdown
          if (message.parseMarkdown && (error as Error).message.includes('parse')) {
            logger.warn('Markdown parsing failed, sending as plain text');
            await this.bot.sendMessage(message.chatId, chunk, {
              ...options,
              parse_mode: undefined,
            });
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      logger.error('Failed to send Telegram message', {
        error: (error as Error).message,
        chatId: message.chatId,
      });
      throw error;
    }
  }

  /**
   * Split message into chunks for Telegram's message limit
   */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a natural break point
      let splitIndex = remaining.lastIndexOf('\n\n', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = remaining.lastIndexOf('\n', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }

      chunks.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex).trim();
    }

    return chunks;
  }

  /**
   * Shutdown the Telegram bot gracefully
   */
  public async shutdown(): Promise<void> {
    if (!this.bot || !this.isRunning) return;

    try {
      await this.bot.stopPolling();
      this.isRunning = false;
      logger.info('Telegram bot stopped');
    } catch (error) {
      logger.error('Error stopping Telegram bot', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Check if the bot is running
   */
  public isActive(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const telegramAdapter = new TelegramAdapter();
