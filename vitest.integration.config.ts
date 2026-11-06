import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: ".env", quiet: true });
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: { environment: "node", include: ["tests/integration/**/*.test.ts"], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false }
});
