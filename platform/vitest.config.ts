import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://toropay:toropay@localhost:5433/toropay_test',
    },
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})