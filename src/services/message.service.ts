/**
 * =============================================================================
 * MESSAGE HANDLER SERVICE
 * =============================================================================
 * Core message processing logic shared across all platforms.
 * Orchestrates session management, security checks, and AI responses.
 */

import { config } from '../config';
import { logger, logConversation } from '../utils/logger';
import { perplexityService } from './perplexity.service';
import { sessionManager } from './session.service';
import { securityService } from './security.service';
import { promptManager } from './prompt.service';
import {
  NormalizedMessage,
  UserSession,
  Platform,
  PerplexityModel,
  AppError,
  ErrorCode,
} from '../types';

/**
 * Response from message processing
 */
export interface MessageResponse {
  content: string;
  citations?: string[];
  error?: boolean;
}

/**
 * Message Handler Service
 * Singleton service for processing messages from any platform
 */
export class MessageHandler {
  private static instance: MessageHandler;

  private constructor() {
    logger.info('Message handler initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MessageHandler {
    if (!MessageHandler.instance) {
      MessageHandler.instance = new MessageHandler();
    }
    return MessageHandler.instance;
  }

  /**
   * Process an incoming message and generate a response
   */
  public async processMessage(message: NormalizedMessage): Promise<MessageResponse> {
    const startTime = Date.now();

    try {
      // Get or create user session
      const session = await sessionManager.getOrCreateSession(
        message.platform,
        message.userId,
        message.userName
      );

      // Security checks
      await this.performSecurityChecks(message, session);

      // Handle commands if applicable
      if (message.isCommand && message.command) {
        return await this.handleCommand(message, session);
      }

      // Process regular message
      return await this.processRegularMessage(message, session);
    } catch (error) {
      return this.handleError(error as Error, message);
    } finally {
      const duration = Date.now() - startTime;
      logger.debug('Message processed', {
        platform: message.platform,
        userId: message.userId,
        duration: `${duration}ms`,
      });
    }
  }

  /**
   * Perform security checks on incoming message
   */
  private async performSecurityChecks(
    message: NormalizedMessage,
    session: UserSession
  ): Promise<void> {
    // Check authorization (whitelist)
    securityService.checkAuthorization(message.userId);

    // Check rate limit
    await securityService.checkRateLimit(message.platform, message.userId);

    // Validate and sanitize input
    message.content = securityService.validateInput(message.content);
  }

  /**
   * Process a regular (non-command) message
   */
  private async processRegularMessage(
    message: NormalizedMessage,
    session: UserSession
  ): Promise<MessageResponse> {
    // Check for prompt injection
    const injectionCheck = securityService.checkPromptInjection(message.content);
    let warningPrefix = '';
    
    if (injectionCheck.isSuspicious) {
      warningPrefix = `⚠️ ${injectionCheck.warning}\n\n`;
    }

    // Add user message to conversation history
    await sessionManager.addMessage(session, 'user', message.content);

    // Log conversation if enabled
    logConversation(message.platform, message.userId, 'user', message.content);

    // Get effective system prompt and configuration
    const baseSystemPrompt = session.customSystemPrompt || promptManager.getGlobalSystemPrompt();
    const secureSystemPrompt = securityService.buildSecureSystemPrompt(baseSystemPrompt);
    
    const model = (session.modelOverride as PerplexityModel) || promptManager.getDefaultModel();
    const temperature = session.temperatureOverride ?? promptManager.getDefaultTemperature();

    // Call Perplexity API
    const response = await perplexityService.chat(
      session.conversationHistory,
      secureSystemPrompt,
      {
        model,
        temperature,
        maxTokens: promptManager.getDefaultMaxTokens(),
      }
    );

    // Validate and process output
    let responseContent = securityService.validateOutput(response.content);

    // Add assistant response to conversation history
    await sessionManager.addMessage(session, 'assistant', responseContent);

    // Log conversation if enabled
    logConversation(message.platform, message.userId, 'assistant', responseContent);

    // Format citations if available and enabled
    let citationsText = '';
    if (config.returnCitations && response.citations && response.citations.length > 0) {
      citationsText = '\n\n📚 **Sources:**\n' + 
        response.citations.map((url, i) => `${i + 1}. ${url}`).join('\n');
    }

    return {
      content: warningPrefix + responseContent + citationsText,
      citations: response.citations,
    };
  }

  /**
   * Handle bot commands
   */
  private async handleCommand(
    message: NormalizedMessage,
    session: UserSession
  ): Promise<MessageResponse> {
    const command = message.command!.toLowerCase();
    const args = message.commandArgs || [];

    switch (command) {
      case 'start':
      case 'help':
        return this.handleStartCommand(session);

      case 'reset':
        return this.handleResetCommand(session);

      case 'setprompt':
        return this.handleSetPromptCommand(session, args);

      case 'model':
        return this.handleModelCommand(session, args);

      case 'preset':
        return this.handlePresetCommand(session, args);

      case 'status':
        return this.handleStatusCommand(session, message.platform);

      case 'config':
        return this.handleConfigCommand(session);

      default:
        return {
          content: `Unknown command: /${command}\n\nUse /help to see available commands.`,
        };
    }
  }

  /**
   * Handle /start or /help command
   */
  private async handleStartCommand(session: UserSession): Promise<MessageResponse> {
    const isAdmin = sessionManager.isAdmin(session);
    
    let helpText = `👋 **Welcome to AI Assistant!**

I'm powered by Perplexity AI and ready to help you with questions, research, and more.

**Available Commands:**
• \`/start\` or \`/help\` - Show this message
• \`/reset\` - Clear conversation history
• \`/preset [name]\` - Use a prompt preset
• \`/status\` - Check your session status
• \`/model [name]\` - View or change AI model`;

    if (isAdmin) {
      helpText += `

**Admin Commands:**
• \`/setprompt [prompt]\` - Set custom system prompt
• \`/config\` - View AI configuration

**Available Models:**
• \`sonar-pro\` - Best for general tasks
• \`sonar-reasoning\` - Deep reasoning & analysis
• \`sonar\` - Fast, efficient responses`;
    }

    helpText += `

Just send me a message to start chatting!`;

    return { content: helpText };
  }

  /**
   * Handle /reset command
   */
  private async handleResetCommand(session: UserSession): Promise<MessageResponse> {
    await sessionManager.clearHistory(session);
    session.customSystemPrompt = undefined;
    session.modelOverride = undefined;
    session.temperatureOverride = undefined;
    await sessionManager.updateSession(session);

    return {
      content: '🔄 **Conversation reset!**\n\nYour conversation history has been cleared and settings restored to defaults.',
    };
  }

  /**
   * Handle /setprompt command
   */
  private async handleSetPromptCommand(
    session: UserSession,
    args: string[]
  ): Promise<MessageResponse> {
    if (!sessionManager.isAdmin(session)) {
      return {
        content: '⛔ This command requires administrator privileges.',
        error: true,
      };
    }

    const prompt = args.join(' ').trim();

    if (!prompt) {
      // Show current prompt
      const currentPrompt = session.customSystemPrompt || promptManager.getGlobalSystemPrompt();
      return {
        content: `**Current System Prompt:**\n\n\`\`\`\n${currentPrompt}\n\`\`\`\n\nTo set a new prompt, use:\n\`/setprompt Your new prompt here\``,
      };
    }

    if (prompt === 'global') {
      // Show current global prompt
      return {
        content: `**Global System Prompt:**\n\n\`\`\`\n${promptManager.getGlobalSystemPrompt()}\n\`\`\``,
      };
    }

    if (prompt === 'clear') {
      session.customSystemPrompt = undefined;
      await sessionManager.updateSession(session);
      return {
        content: '✅ Custom prompt cleared. Using global default.',
      };
    }

    // Set new custom prompt
    await sessionManager.setCustomPrompt(session, prompt);

    return {
      content: `✅ **Custom system prompt set!**\n\n\`\`\`\n${prompt}\n\`\`\``,
    };
  }

  /**
   * Handle /model command
   */
  private async handleModelCommand(
    session: UserSession,
    args: string[]
  ): Promise<MessageResponse> {
    const availableModels = perplexityService.getAvailableModels();
    const modelArg = args[0]?.toLowerCase();

    if (!modelArg) {
      const currentModel = session.modelOverride || promptManager.getDefaultModel();
      return {
        content: `**Current Model:** \`${currentModel}\`

**Available Models:**
${availableModels.map(m => `• \`${m}\`${m === currentModel ? ' ✓' : ''}`).join('\n')}

To change model: \`/model [model-name]\``,
      };
    }

    if (!availableModels.includes(modelArg as PerplexityModel)) {
      return {
        content: `❌ Unknown model: \`${modelArg}\`\n\nAvailable: ${availableModels.join(', ')}`,
        error: true,
      };
    }

    await sessionManager.setModelOverride(session, modelArg);

    return {
      content: `✅ Model changed to \`${modelArg}\``,
    };
  }

  /**
   * Handle /preset command
   */
  private async handlePresetCommand(
    session: UserSession,
    args: string[]
  ): Promise<MessageResponse> {
    const presets = promptManager.getPresets();
    const presetArg = args[0]?.toLowerCase();

    if (!presetArg) {
      return {
        content: `**Available Presets:**

${promptManager.getPresetList()}

To use a preset: \`/preset [name]\``,
      };
    }

    const preset = presets[presetArg];
    if (!preset) {
      return {
        content: `❌ Unknown preset: \`${presetArg}\`\n\nUse \`/preset\` to see available presets.`,
        error: true,
      };
    }

    // Apply preset
    session.customSystemPrompt = preset.prompt;
    if (preset.model) {
      session.modelOverride = preset.model;
    }
    if (preset.temperature !== undefined) {
      session.temperatureOverride = preset.temperature;
    }
    await sessionManager.updateSession(session);

    return {
      content: `✅ **Preset Applied: ${preset.name}**

${preset.description}

${preset.model ? `Model: \`${preset.model}\`` : ''}
${preset.temperature !== undefined ? `Temperature: ${preset.temperature}` : ''}`,
    };
  }

  /**
   * Handle /status command
   */
  private async handleStatusCommand(
    session: UserSession,
    platform: Platform
  ): Promise<MessageResponse> {
    const rateStatus = await securityService.getRateLimitStatus(platform, session.userId);
    const currentModel = session.modelOverride || promptManager.getDefaultModel();
    const hasCustomPrompt = !!session.customSystemPrompt;

    return {
      content: `📊 **Session Status**

• **Platform:** ${platform}
• **Role:** ${session.role}
• **Model:** \`${currentModel}\`
• **Custom Prompt:** ${hasCustomPrompt ? 'Yes' : 'No'}
• **Conversation History:** ${session.conversationHistory.length} messages
• **Rate Limit:** ${rateStatus.remaining}/${rateStatus.total} remaining

Session created: ${session.createdAt.toISOString()}`,
    };
  }

  /**
   * Handle /config command (admin only)
   */
  private async handleConfigCommand(session: UserSession): Promise<MessageResponse> {
    if (!sessionManager.isAdmin(session)) {
      return {
        content: '⛔ This command requires administrator privileges.',
        error: true,
      };
    }

    return {
      content: promptManager.getConfigSummary(),
    };
  }

  /**
   * Handle errors during message processing
   */
  private handleError(error: Error, message: NormalizedMessage): MessageResponse {
    if (error instanceof AppError) {
      logger.warn('Application error', {
        code: error.code,
        message: error.message,
        platform: message.platform,
        userId: message.userId,
      });

      switch (error.code) {
        case ErrorCode.RATE_LIMITED:
          return {
            content: `⏳ ${error.message}`,
            error: true,
          };

        case ErrorCode.NOT_WHITELISTED:
          return {
            content: `🔒 ${error.message}`,
            error: true,
          };

        case ErrorCode.API_RATE_LIMITED:
          return {
            content: '⚠️ The AI service is currently busy. Please try again in a moment.',
            error: true,
          };

        case ErrorCode.API_TIMEOUT:
          return {
            content: '⏱️ The request took too long. Please try again with a shorter message.',
            error: true,
          };

        default:
          return {
            content: `❌ Error: ${error.message}`,
            error: true,
          };
      }
    }

    // Unexpected errors
    logger.error('Unexpected error processing message', {
      error: error.message,
      stack: error.stack,
      platform: message.platform,
      userId: message.userId,
    });

    return {
      content: '❌ An unexpected error occurred. Please try again later.',
      error: true,
    };
  }
}

// Export singleton instance
export const messageHandler = MessageHandler.getInstance();
