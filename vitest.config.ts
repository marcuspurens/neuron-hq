import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      // Disable real Postgres in tests so loadGraph/saveGraph use file fallback
      DATABASE_URL: 'postgresql://localhost:1/disabled',
    },
    exclude: ['workspaces/**', 'runs/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
