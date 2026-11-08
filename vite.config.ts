/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // src/styles.test.ts reads index.css?raw; Vitest otherwise blanks CSS imports
    css: { include: [/index\.css/] },
    include: ['src/**/*.test.{ts,tsx}', 'e2e/**/*.test.ts'],
  },
})
