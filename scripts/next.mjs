import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(root, ".env")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const child = spawn(process.execPath, [
  resolve(root, "apps/web/node_modules/next/dist/bin/next"),
  process.argv[2] ?? "dev", resolve(root, "apps/web"), ...process.argv.slice(3)
], { cwd: root, env: process.env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", error => { console.error(error.message); process.exit(1); });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
