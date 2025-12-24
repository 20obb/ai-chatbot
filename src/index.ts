/**
 * =============================================================================
 * APPLICATION ENTRY POINT
 * =============================================================================
 * Main entry point for the multi-platform AI chatbot system.
 * Initializes all services and platform adapters.
 */

import { config } from './config';
import { logger } from './utils/logger';
import { perplexityService } from './services/perplexity.service';
import { promptManager } from './services/prompt.service';
import { telegramAdapter } from './bots/telegram.adapter';
import { whatsappAdapter } from './bots/whatsapp.adapter';
import { startAdminServer } from './api/admin';

/**
 * Application startup banner
 */
function printBanner(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║          🤖 AI CHATBOT - MULTI-PLATFORM ASSISTANT 🤖         ║
║                                                              ║
║       Powered by Perplexity AI (Sonar Pro / Reasoning)       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
}

/**
 * Initialize all services and adapters
 */
async function initialize(): Promise<void> {
  logger.info('Starting AI Chatbot system...');

  // Validate Perplexity API key
  logger.info('Validating Perplexity API key...');
  const isValidApiKey = await perplexityService.validateApiKey();
  if (!isValidApiKey) {
    logger.error('Perplexity API key validation failed. Please check your configuration.');
    if (config.nodeEnv === 'production') {
      process.exit(1);
    } else {
      logger.warn('Continuing in development mode despite API key validation failure');
    }
  } else {
    logger.info('Perplexity API key validated successfully');
  }

  // Log configuration summary
  logger.info('Configuration loaded', {
    model: promptManager.getDefaultModel(),
    temperature: promptManager.getDefaultTemperature(),
    telegramEnabled: config.telegramEnabled,
    whatsappEnabled: config.whatsappEnabled,
    whitelistEnabled: config.whitelistEnabled,
    adminCount: config.adminUserIds.length,
  });

  // Start admin API server
  await startAdminServer();

  // Initialize platform adapters
  const initPromises: Promise<void>[] = [];

  if (config.telegramEnabled) {
    initPromises.push(
      telegramAdapter.initialize().catch((error) => {
        logger.error('Failed to initialize Telegram adapter', {
          error: error.message,
        });
      })
    );
  }

  if (config.whatsappEnabled) {
    initPromises.push(
      whatsappAdapter.initialize().catch((error) => {
        logger.error('Failed to initialize WhatsApp adapter', {
          error: error.message,
        });
      })
    );
  }

  await Promise.all(initPromises);

  // Print status
  console.log('\n📊 Platform Status:');
  if (config.telegramEnabled) {
    console.log(`   • Telegram: ${telegramAdapter.isActive() ? '✅ Active' : '⏳ Connecting...'}`);
  } else {
    console.log('   • Telegram: ❌ Disabled');
  }
  if (config.whatsappEnabled) {
    console.log(`   • WhatsApp: ${whatsappAdapter.isActive() ? '✅ Active' : '⏳ Waiting for QR scan...'}`);
  } else {
    console.log('   • WhatsApp: ❌ Disabled');
  }
  console.log('');

  logger.info('AI Chatbot system started successfully');
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Shutdown adapters
    await Promise.all([
      telegramAdapter.shutdown(),
      whatsappAdapter.shutdown(),
    ]);

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: (error as Error).message });
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  printBanner();

  // Set up signal handlers for graceful shutdown
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    if (config.nodeEnv === 'production') {
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  try {
    await initialize();
  } catch (error) {
    logger.error('Failed to start application', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    process.exit(1);
  }
}

// Start the application
main();
