import { defineConfig } from 'vitest/config';

// Unit tests for the VS Code-free code in src/engine and src/actions.
// src/test holds the Extension Development Host suite, run by `npm test`.
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
