import path from 'path'
import { defineConfig } from 'vitest/config'

// Lets tests import app code that uses the "@/..." path alias from tsconfig.json.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  // Next.js compiles JSX itself (tsconfig.json says "preserve"); tests that load pages need it compiled here.
  oxc: { jsx: { runtime: 'automatic' } },
})
