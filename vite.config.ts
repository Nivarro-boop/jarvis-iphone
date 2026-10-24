import { defineConfig } from 'vitest/config'

// GitHub Pages liefert unter /jarvis-iphone/ aus; lokal reicht "/".
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/',
  build: { target: 'safari16', sourcemap: true },
  test: { environment: 'jsdom' }
})
