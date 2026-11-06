import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals, ...nextTs,
  { settings: { next: { rootDir: "apps/web" } } },
  globalIgnores(["**/node_modules/**", "**/public/vendor/**", "**/dist/**", "**/.next/**", "**/next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**", "imports/**", "work/**"])
]);
