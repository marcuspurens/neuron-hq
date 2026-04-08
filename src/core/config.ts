import { z } from 'zod';

const ConfigSchema = z.object({
  // Database
  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().default(5),
  // Ollama
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL_EMBED: z.string().default('snowflake-arctic-embed'),
  OLLAMA_MODEL_VISION: z.string().default('aurora-vision-extract'),
  OLLAMA_MODEL_POLISH: z.string().default('gemma3'),
  // Aurora
  AURORA_PYTHON_PATH: z.string().default('python3'),
  PYANNOTE_TOKEN: z.string().optional(),
  // Langfuse
  LANGFUSE_ENABLED: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().default('http://localhost:3000'),
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // API - note: ANTHROPIC_API_KEY is NOT here because agent-client.ts
  // uses dynamic env var names via config.apiKeyEnv
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let _config: AppConfig | null = null;

/**
 * Get the centralized application config, parsed and validated from process.env.
 * Caches the result after first call; use resetConfig() to clear.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    _config = ConfigSchema.parse(process.env);
  }
  return _config;
}

/**
 * Clear the cached config. Useful for testing or reloading after env changes.
 */
export function resetConfig(): void {
  _config = null;
}
