import path from 'path'
import { defineConfig } from 'vitest/config'

// Lets tests import app code that uses the "@/..." path alias from tsconfig.json.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
})
