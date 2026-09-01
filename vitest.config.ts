import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["test/setup.ts"],
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/style.css", "src/main.ts"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 95,
        branches: 75,
      },
    },
  },
});
