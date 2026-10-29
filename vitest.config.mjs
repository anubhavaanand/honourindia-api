import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['apps/**/*.test.{ts,js}', 'packages/**/*.test.{ts,js}'],
    globals: true,
  },
})
