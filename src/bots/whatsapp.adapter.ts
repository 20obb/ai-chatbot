/**
 * =============================================================================
 * WHATSAPP BOT ADAPTER
 * =============================================================================
 * Handles all WhatsApp-specific functionality including QR code authentication,
 * session persistence, message handling, and sending.
 * 
 * Uses whatsapp-web.js library which requires a Chromium browser.
 */

import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
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
 * WhatsApp Bot Adapter
 * Implements the PlatformAdapter interface for WhatsApp
 */
export class WhatsAppAdapter implements PlatformAdapter {
  public readonly platform: Platform = 'whatsapp';
  private client: Client | null = null;
  private isRunning = false;
  private isReady = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  /**
   * Initialize the WhatsApp client
   */
  public async initialize(): Promise<void> {
    if (!config.whatsappEnabled) {
      logger.info('WhatsApp bot is disabled');
      return;
    }

    try {
      // Ensure session directory exists
      const sessionPath = path.resolve(config.whatsappSessionPath);
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
      }

      // Create WhatsApp client with local authentication for session persistence
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: sessionPath,
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        },
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Initialize the client
      await this.client.initialize();
      this.isRunning = true;

      logger.info('WhatsApp client initializing...');
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Set up event handlers for the WhatsApp client
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // QR Code event - display QR for authentication
    this.client.on('qr', (qr: string) => {
      logger.info('WhatsApp QR Code received - scan to authenticate');
      console.log('\n========================================');
      console.log('   SCAN THIS QR CODE WITH WHATSAPP');
      console.log('========================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\n========================================\n');
    });

    // Authentication successful
    this.client.on('authenticated', () => {
      logger.info('WhatsApp authentication successful');
      this.reconnectAttempts = 0;
    });

    // Authentication failure
    this.client.on('auth_failure', (msg: string) => {
      logger.error('WhatsApp authentication failed', { message: msg });
    });

    // Client ready
    this.client.on('ready', () => {
      this.isReady = true;
      logger.info('WhatsApp client is ready');
      console.log('\n✅ WhatsApp Bot is now online and ready to receive messages!\n');
    });

    // Handle incoming messages
    this.client.on('message', async (msg: Message) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        logger.error('Error handling WhatsApp message', {
          error: (error as Error).message,
          from: msg.from,
        });
      }
    });

    // Handle incoming messages that create a notification
    this.client.on('message_create', async (msg: Message) => {
      // Only handle messages from others (not self)
      if (msg.fromMe) return;
      // The regular 'message' event should handle this
    });

    // Disconnected
    this.client.on('disconnected', async (reason: string) => {
      logger.warn('WhatsApp client disconnected', { reason });
      this.isReady = false;
      
      // Attempt to reconnect
      await this.handleDisconnect();
    });

    // Handle state changes
    this.client.on('change_state', (state: string) => {
      logger.debug('WhatsApp state changed', { state });
    });
  }

  /**
   * Handle disconnection and attempt reconnection
   */
  private async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached for WhatsApp');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    logger.info('Attempting WhatsApp reconnection', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.client?.initialize();
    } catch (error) {
      logger.error('WhatsApp reconnection failed', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle incoming WhatsApp message
   */
  private async handleMessage(msg: Message): Promise<void> {
    // Ignore messages from self
    if (msg.fromMe) return;

    // Ignore group messages (optional - can be enabled)
    // if (msg.from.includes('@g.us')) return;

    // Ignore non-text messages
    if (msg.type !== 'chat') {
      // Could handle other message types here
      return;
    }

    const text = msg.body;
    if (!text || text.trim().length === 0) return;

    // Get chat for sending typing indicator
    const chat = await msg.getChat();

    try {
      // Show typing indicator
      await chat.sendStateTyping();

      // Normalize the message
      const normalizedMessage = this.normalizeMessage(msg);

      // Process the message through the message handler
      const response = await messageHandler.processMessage(normalizedMessage);

      // Clear typing indicator
      await chat.clearState();

      // Send the response
      await this.sendMessage({
        chatId: msg.from,
        content: response.content,
        replyToMessageId: msg.id._serialized,
      });
    } catch (error) {
      await chat.clearState();
      throw error;
    }
  }

  /**
   * Normalize WhatsApp message to standard format
   */
  private normalizeMessage(msg: Message): NormalizedMessage {
    const text = msg.body;
    const isCommand = text.startsWith('/');
    
    let command: string | undefined;
    let commandArgs: string[] = [];
    let content = text;

    if (isCommand) {
      const parts = text.slice(1).split(/\s+/);
      command = parts[0].toLowerCase();
      commandArgs = parts.slice(1);
      content = commandArgs.join(' ');
    }

    // Extract phone number from WhatsApp ID (format: phone@c.us)
    const userId = msg.from.split('@')[0];

    return {
      id: msg.id._serialized,
      platform: 'whatsapp',
      userId,
      chatId: msg.from,
      content: isCommand ? content : text,
      timestamp: new Date(msg.timestamp * 1000),
      raw: msg,
      userName: (msg as any)._data?.notifyName,
      isCommand,
      command,
      commandArgs,
    };
  }

  /**
   * Send a message to a WhatsApp chat
   */
  public async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.client || !this.isReady) {
      logger.error('Cannot send message: WhatsApp client not ready');
      return;
    }

    try {
      // WhatsApp has a 65536 character limit, but we'll keep messages shorter
      const chunks = this.splitMessage(message.content, 4000);

      for (const chunk of chunks) {
        // Format message for WhatsApp (convert markdown to WhatsApp formatting)
        const formattedChunk = this.formatForWhatsApp(chunk);
        
        await this.client.sendMessage(message.chatId, formattedChunk);
        
        // Small delay between chunks to avoid rate limiting
        if (chunks.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      logger.error('Failed to send WhatsApp message', {
        error: (error as Error).message,
        chatId: message.chatId,
      });
      throw error;
    }
  }

  /**
   * Format message content for WhatsApp
   * Converts markdown to WhatsApp formatting
   */
  private formatForWhatsApp(text: string): string {
    // Convert markdown bold (**text** or __text__) to WhatsApp bold (*text*)
    text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
    text = text.replace(/__(.+?)__/g, '*$1*');
    
    // Convert markdown italic (*text* or _text_) - be careful not to affect bold
    // WhatsApp uses _text_ for italic
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_');
    
    // Convert markdown strikethrough (~~text~~) to WhatsApp strikethrough (~text~)
    text = text.replace(/~~(.+?)~~/g, '~$1~');
    
    // Convert markdown code blocks (```code```) to WhatsApp monospace (```code```)
    // WhatsApp already uses ``` for code blocks, so this works
    
    // Convert inline code (`code`) to WhatsApp monospace (```code```)
    text = text.replace(/`([^`]+)`/g, '```$1```');
    
    return text;
  }

  /**
   * Split message into chunks
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
   * Shutdown the WhatsApp client gracefully
   */
  public async shutdown(): Promise<void> {
    if (!this.client || !this.isRunning) return;

    try {
      await this.client.destroy();
      this.isRunning = false;
      this.isReady = false;
      logger.info('WhatsApp client stopped');
    } catch (error) {
      logger.error('Error stopping WhatsApp client', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Check if the client is ready
   */
  public isActive(): boolean {
    return this.isReady;
  }

  /**
   * Get client info
   */
  public async getInfo(): Promise<{ connected: boolean; phone?: string }> {
    if (!this.client || !this.isReady) {
      return { connected: false };
    }

    try {
      const info = this.client.info;
      return {
        connected: true,
        phone: info?.wid?.user,
      };
    } catch {
      return { connected: false };
    }
  }

  /**
   * Logout and clear session data
   */
  public async logout(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.logout();
      logger.info('WhatsApp client logged out');
    } catch (error) {
      logger.error('Error logging out WhatsApp client', {
        error: (error as Error).message,
      });
    }
  }
}

// Export singleton instance
export const whatsappAdapter = new WhatsAppAdapter();
