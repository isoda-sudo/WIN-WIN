import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["__tests__/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
    setupFiles: ["__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "~": resolve(import.meta.dirname, "./src/"),
    },
  },
});
