// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    fileParallelism: false,
  },
})
