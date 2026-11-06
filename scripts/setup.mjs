import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const flags = new Set(process.argv.slice(2));
if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Bitte Node.js 24 oder neuer verwenden.");

if (!existsSync(".env")) {
  const password = randomBytes(24).toString("hex");
  const storageSecret = randomBytes(24).toString("hex");
  const template = readFileSync(".env.example", "utf8")
    .replace("replace-with-a-random-secret-of-at-least-32-characters", randomBytes(48).toString("base64url"))
    .replaceAll("atlas_local_only", password)
    .replaceAll("atlas_s3_local_only", storageSecret);
  writeFileSync(".env", template, { mode: 0o600, flag: "wx" });
  console.info("Lokale .env mit zufälligen Entwicklungssecrets angelegt. Bestehende Konfiguration wird nie überschrieben.");
}
if (flags.has("--env-only")) process.exit(0);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env, shell: false });
  if (result.error || result.status !== 0) {
    console.error(`Setup-Schritt fehlgeschlagen: ${command} ${args.join(" ")}. Details stehen direkt darüber. Vorhandene Daten bleiben erhalten.`);
    process.exit(result.status || 1);
  }
}
if (!flags.has("--skip-install")) run("pnpm", ["install", "--frozen-lockfile"]);
run("docker", ["compose", "up", "-d", "--wait"]);
run("pnpm", ["db:migrate"]);
run("pnpm", ["db:seed"]);
console.info("ATLAS ist lokal vorbereitet. Starte mit pnpm dev und öffne http://127.0.0.1:3000.");
console.info("Synthetisches Demo-Login: admin@atlas.example / Atlas-Demo-2026!");
