/**
 * =============================================================================
 * ADMIN API SERVER
 * =============================================================================
 * Express server for health checks, admin operations, and runtime configuration.
 * Provides endpoints for managing the chatbot system without redeployment.
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { config } from '../config';
import { logger } from '../utils/logger';
import { promptManager } from '../services/prompt.service';
import { perplexityService } from '../services/perplexity.service';
import { telegramAdapter } from '../bots/telegram.adapter';
import { whatsappAdapter } from '../bots/whatsapp.adapter';
import { PerplexityModel, AppError, ErrorCode } from '../types';

const app = express();

// Security middleware
app.use(helmet());
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.debug('API request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

/**
 * Simple API key authentication middleware
 * In production, use a more robust authentication system
 */
const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.ADMIN_API_KEY;

  // If no admin API key is configured, only allow from localhost
  if (!expectedKey) {
    const clientIp = req.ip || req.socket.remoteAddress;
    if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
      return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
};

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

/**
 * Basic health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Detailed health check with service status
 */
app.get('/health/detailed', async (req: Request, res: Response) => {
  const telegramStatus = telegramAdapter.isActive();
  const whatsappInfo = await whatsappAdapter.getInfo();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      telegram: {
        enabled: config.telegramEnabled,
        active: telegramStatus,
      },
      whatsapp: {
        enabled: config.whatsappEnabled,
        connected: whatsappInfo.connected,
        phone: whatsappInfo.phone,
      },
    },
    config: {
      defaultModel: promptManager.getDefaultModel(),
      defaultTemperature: promptManager.getDefaultTemperature(),
      whitelistEnabled: config.whitelistEnabled,
      rateLimitRequests: config.rateLimitRequests,
      rateLimitWindow: config.rateLimitWindowSeconds,
    },
  });
});

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * Get current AI configuration
 */
app.get('/admin/config', authenticateAdmin, (req: Request, res: Response) => {
  res.json({
    globalSystemPrompt: promptManager.getGlobalSystemPrompt(),
    defaultModel: promptManager.getDefaultModel(),
    defaultTemperature: promptManager.getDefaultTemperature(),
    defaultMaxTokens: promptManager.getDefaultMaxTokens(),
    presets: promptManager.getPresets(),
  });
});

/**
 * Update global system prompt
 */
app.put('/admin/config/prompt', authenticateAdmin, (req: Request, res: Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required and must be a string' });
  }

  promptManager.setGlobalSystemPrompt(prompt);

  res.json({
    success: true,
    message: 'Global system prompt updated',
  });
});

/**
 * Update default model
 */
app.put('/admin/config/model', authenticateAdmin, (req: Request, res: Response) => {
  const { model } = req.body;
  const availableModels = perplexityService.getAvailableModels();

  if (!model || !availableModels.includes(model)) {
    return res.status(400).json({
      error: 'Invalid model',
      availableModels,
    });
  }

  promptManager.setDefaultModel(model as PerplexityModel);

  res.json({
    success: true,
    message: `Default model updated to ${model}`,
  });
});

/**
 * Update default temperature
 */
app.put('/admin/config/temperature', authenticateAdmin, (req: Request, res: Response) => {
  const { temperature } = req.body;

  if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
    return res.status(400).json({
      error: 'Temperature must be a number between 0 and 2',
    });
  }

  promptManager.setDefaultTemperature(temperature);

  res.json({
    success: true,
    message: `Default temperature updated to ${temperature}`,
  });
});

/**
 * Get available presets
 */
app.get('/admin/presets', authenticateAdmin, (req: Request, res: Response) => {
  res.json(promptManager.getPresets());
});

/**
 * Create or update a preset
 */
app.put('/admin/presets/:key', authenticateAdmin, (req: Request, res: Response) => {
  const { key } = req.params;
  const { name, description, prompt, model, temperature } = req.body;

  if (!name || !description || !prompt) {
    return res.status(400).json({
      error: 'name, description, and prompt are required',
    });
  }

  promptManager.setPreset(key, {
    name,
    description,
    prompt,
    model,
    temperature,
  });

  res.json({
    success: true,
    message: `Preset '${key}' updated`,
  });
});

/**
 * Delete a preset
 */
app.delete('/admin/presets/:key', authenticateAdmin, (req: Request, res: Response) => {
  const { key } = req.params;

  if (key === 'default') {
    return res.status(400).json({ error: 'Cannot delete default preset' });
  }

  const deleted = promptManager.deletePreset(key);

  if (!deleted) {
    return res.status(404).json({ error: 'Preset not found' });
  }

  res.json({
    success: true,
    message: `Preset '${key}' deleted`,
  });
});

/**
 * Reload configuration from file
 */
app.post('/admin/config/reload', authenticateAdmin, (req: Request, res: Response) => {
  promptManager.reloadConfig();

  res.json({
    success: true,
    message: 'Configuration reloaded',
  });
});

/**
 * Get available models
 */
app.get('/admin/models', authenticateAdmin, (req: Request, res: Response) => {
  res.json({
    models: perplexityService.getAvailableModels(),
    current: promptManager.getDefaultModel(),
  });
});

/**
 * Validate API key
 */
app.post('/admin/validate-api-key', authenticateAdmin, async (req: Request, res: Response) => {
  const isValid = await perplexityService.validateApiKey();

  res.json({
    valid: isValid,
    message: isValid ? 'API key is valid' : 'API key validation failed',
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

/**
 * Error handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('API error', {
    error: err.message,
    path: req.path,
  });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Start the admin API server
 */
export function startAdminServer(): Promise<void> {
  return new Promise((resolve) => {
    app.listen(config.serverPort, () => {
      logger.info('Admin API server started', { port: config.serverPort });
      console.log(`\n📡 Admin API available at http://localhost:${config.serverPort}`);
      console.log(`   Health check: http://localhost:${config.serverPort}/health\n`);
      resolve();
    });
  });
}

export default app;
