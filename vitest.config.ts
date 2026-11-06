import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: { environment: "node", include: ["packages/**/*.test.ts", "tests/unit/**/*.test.ts"], exclude: [...configDefaults.exclude, "tests/integration/**", "tests/e2e/**"], testTimeout: 15000 }
});
