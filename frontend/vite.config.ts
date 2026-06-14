import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/**', // Exclude Playwright E2E tests
      '**/.{idea,git,cache,output,temp}/**'
    ]
  }
} as any)
