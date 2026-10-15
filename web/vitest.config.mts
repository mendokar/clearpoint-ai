import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/helpers/setup.ts"],
    restoreMocks: true,
    silent: "passed-only",
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**", "components/chat/**", "components/product/selection.ts", "security-headers.mjs"],
      exclude: ["lib/firebase/client.ts", "lib/orders/client.ts", "**/*.d.ts"],
      reporter: ["text", "html"],
    },
  },
});
