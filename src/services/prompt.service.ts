/**
 * =============================================================================
 * SYSTEM PROMPT MANAGER
 * =============================================================================
 * Centralized management of system prompts with runtime updating capability.
 * Allows admins to change AI behavior without redeployment.
 */

import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { PerplexityModel } from '../types';

/**
 * Prompt preset for different use cases
 */
interface PromptPreset {
  name: string;
  description: string;
  prompt: string;
  model?: PerplexityModel;
  temperature?: number;
}

/**
 * AI Configuration that can be modified at runtime
 */
interface AIConfiguration {
  globalSystemPrompt: string;
  defaultModel: PerplexityModel;
  defaultTemperature: number;
  defaultMaxTokens: number;
  presets: Record<string, PromptPreset>;
}

/**
 * System Prompt Manager
 * Singleton service for managing AI behavior configuration
 */
export class PromptManager {
  private static instance: PromptManager;
  private config: AIConfiguration;
  private configPath: string;

  private constructor() {
    this.configPath = path.resolve(process.cwd(), 'data', 'ai-config.json');
    this.config = this.loadConfig();
    
    logger.info('Prompt manager initialized', {
      model: this.config.defaultModel,
      presets: Object.keys(this.config.presets).length,
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PromptManager {
    if (!PromptManager.instance) {
      PromptManager.instance = new PromptManager();
    }
    return PromptManager.instance;
  }

  /**
   * Load configuration from file or use defaults
   */
  private loadConfig(): AIConfiguration {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data) as AIConfiguration;
        logger.info('Loaded AI configuration from file');
        return this.mergeWithDefaults(loaded);
      }
    } catch (error) {
      logger.error('Error loading AI configuration', { error: (error as Error).message });
    }

    return this.getDefaultConfig();
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): AIConfiguration {
    return {
      globalSystemPrompt: config.defaultSystemPrompt,
      defaultModel: config.defaultModel,
      defaultTemperature: config.defaultTemperature,
      defaultMaxTokens: config.defaultMaxTokens,
      presets: {
        default: {
          name: 'Default Assistant',
          description: 'General-purpose helpful assistant',
          prompt: config.defaultSystemPrompt,
        },
        researcher: {
          name: 'Research Assistant',
          description: 'Focused on detailed research with citations',
          prompt: `You are a meticulous research assistant powered by Perplexity. Your role is to:
1. Provide thoroughly researched, accurate answers
2. Always cite your sources with links when available
3. Present information in a well-structured format
4. Distinguish between verified facts and opinions/speculation
5. Acknowledge when information is uncertain or when you need more context
6. Use markdown formatting for clarity`,
          model: 'sonar-reasoning',
          temperature: 0.3,
        },
        creative: {
          name: 'Creative Writer',
          description: 'Creative writing and brainstorming',
          prompt: `You are a creative writing assistant. Your role is to:
1. Help with creative writing, storytelling, and brainstorming
2. Offer imaginative suggestions and ideas
3. Adapt your writing style to match the user's needs
4. Provide constructive feedback on creative work
5. Be encouraging and supportive of creative exploration`,
          model: 'sonar-pro',
          temperature: 0.9,
        },
        coder: {
          name: 'Coding Assistant',
          description: 'Programming and technical help',
          prompt: `You are an expert programming assistant. Your role is to:
1. Write clean, efficient, and well-documented code
2. Explain technical concepts clearly
3. Debug issues methodically
4. Suggest best practices and modern approaches
5. Provide code examples with explanations
6. Use appropriate markdown code blocks with language syntax highlighting`,
          model: 'sonar-pro',
          temperature: 0.2,
        },
        concise: {
          name: 'Concise Responder',
          description: 'Brief, to-the-point answers',
          prompt: `You are a concise assistant. Your role is to:
1. Provide brief, direct answers
2. Avoid unnecessary elaboration
3. Use bullet points when listing items
4. Only expand on topics when explicitly asked
5. Get straight to the point`,
          model: 'sonar',
          temperature: 0.5,
        },
      },
    };
  }

  /**
   * Merge loaded config with defaults to ensure all fields exist
   */
  private mergeWithDefaults(loaded: Partial<AIConfiguration>): AIConfiguration {
    const defaults = this.getDefaultConfig();
    return {
      globalSystemPrompt: loaded.globalSystemPrompt || defaults.globalSystemPrompt,
      defaultModel: loaded.defaultModel || defaults.defaultModel,
      defaultTemperature: loaded.defaultTemperature ?? defaults.defaultTemperature,
      defaultMaxTokens: loaded.defaultMaxTokens ?? defaults.defaultMaxTokens,
      presets: { ...defaults.presets, ...loaded.presets },
    };
  }

  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      logger.info('Saved AI configuration to file');
    } catch (error) {
      logger.error('Error saving AI configuration', { error: (error as Error).message });
    }
  }

  /**
   * Get the global system prompt
   */
  public getGlobalSystemPrompt(): string {
    return this.config.globalSystemPrompt;
  }

  /**
   * Set the global system prompt
   */
  public setGlobalSystemPrompt(prompt: string): void {
    this.config.globalSystemPrompt = prompt;
    this.saveConfig();
    logger.info('Updated global system prompt');
  }

  /**
   * Get default model
   */
  public getDefaultModel(): PerplexityModel {
    return this.config.defaultModel;
  }

  /**
   * Set default model
   */
  public setDefaultModel(model: PerplexityModel): void {
    this.config.defaultModel = model;
    this.saveConfig();
    logger.info('Updated default model', { model });
  }

  /**
   * Get default temperature
   */
  public getDefaultTemperature(): number {
    return this.config.defaultTemperature;
  }

  /**
   * Set default temperature
   */
  public setDefaultTemperature(temperature: number): void {
    this.config.defaultTemperature = Math.max(0, Math.min(2, temperature));
    this.saveConfig();
    logger.info('Updated default temperature', { temperature: this.config.defaultTemperature });
  }

  /**
   * Get default max tokens
   */
  public getDefaultMaxTokens(): number {
    return this.config.defaultMaxTokens;
  }

  /**
   * Set default max tokens
   */
  public setDefaultMaxTokens(maxTokens: number): void {
    this.config.defaultMaxTokens = Math.max(1, Math.min(8192, maxTokens));
    this.saveConfig();
    logger.info('Updated default max tokens', { maxTokens: this.config.defaultMaxTokens });
  }

  /**
   * Get all available presets
   */
  public getPresets(): Record<string, PromptPreset> {
    return this.config.presets;
  }

  /**
   * Get a specific preset
   */
  public getPreset(name: string): PromptPreset | null {
    return this.config.presets[name] || null;
  }

  /**
   * Add or update a preset
   */
  public setPreset(key: string, preset: PromptPreset): void {
    this.config.presets[key] = preset;
    this.saveConfig();
    logger.info('Updated preset', { key, name: preset.name });
  }

  /**
   * Delete a preset
   */
  public deletePreset(key: string): boolean {
    if (key === 'default') {
      return false; // Cannot delete default preset
    }
    if (this.config.presets[key]) {
      delete this.config.presets[key];
      this.saveConfig();
      logger.info('Deleted preset', { key });
      return true;
    }
    return false;
  }

  /**
   * Get preset list as formatted string
   */
  public getPresetList(): string {
    const presets = Object.entries(this.config.presets);
    return presets
      .map(([key, preset]) => `• **${key}**: ${preset.name} - ${preset.description}`)
      .join('\n');
  }

  /**
   * Get current AI configuration summary
   */
  public getConfigSummary(): string {
    return `**AI Configuration:**
• Model: \`${this.config.defaultModel}\`
• Temperature: ${this.config.defaultTemperature}
• Max Tokens: ${this.config.defaultMaxTokens}
• Presets: ${Object.keys(this.config.presets).length}

**System Prompt Preview:**
${this.config.globalSystemPrompt.substring(0, 200)}${this.config.globalSystemPrompt.length > 200 ? '...' : ''}`;
  }

  /**
   * Reload configuration from file
   */
  public reloadConfig(): void {
    this.config = this.loadConfig();
    logger.info('Reloaded AI configuration');
  }
}

// Export singleton instance
export const promptManager = PromptManager.getInstance();
