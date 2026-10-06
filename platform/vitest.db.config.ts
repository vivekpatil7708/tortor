import path from 'path'
import { defineConfig } from 'vitest/config'

// Database tests (tests/db): a real Postgres, one file at a time because they
// share it. Run them with `npm run test:db` (scripts/test-db.mjs), which only
// allows a throwaway local database.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/db/**/*.db.test.ts'],
    setupFiles: ['tests/db/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
