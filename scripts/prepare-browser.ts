import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "dotenv";

const dnsLabel = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Derive the one browser origin used by both authentication and Next.js. */
export function browserOrigin(runtime: NodeJS.ProcessEnv): string {
  const name = runtime.CODESPACE_NAME;
  const domain = runtime.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (!name && !domain && runtime.CODESPACES !== "true") return "http://127.0.0.1:3000";
  const labels = domain?.split(".") ?? [];
  if (!name || !dnsLabel.test(name) || name.length + 5 > 63 || !domain || domain.length > 253 ||
      labels.length < 2 || labels.some(label => !dnsLabel.test(label) || label.length > 63)) {
    throw new Error("Die Codespaces-Browseradresse fehlt oder ist ungültig. Die Umgebung wurde nicht verändert.");
  }
  return `https://${name}-3000.${domain}`;
}

/** Compose starts first, so fresh devcontainers must use its development credentials. */
export function prepareBrowserEnvironment(root: string, runtime: NodeJS.ProcessEnv): { created: boolean; appUrl: string } {
  const appUrl = browserOrigin(runtime);
  const path = resolve(root, ".env");
  if (existsSync(path)) {
    const current = parse(readFileSync(path));
    if (current.APP_URL !== appUrl || current.BETTER_AUTH_URL !== appUrl) {
      throw new Error("Die vorhandene .env gehört zu einer anderen Browseradresse. Sie wurde erhalten. APP_URL und BETTER_AUTH_URL müssen zur aktuellen Vorschau passen.");
    }
    return { created: false, appUrl };
  }
  const contents = [
    "# Private browser development demo; never use these service credentials in production.",
    `APP_URL=${appUrl}`,
    `BETTER_AUTH_URL=${appUrl}`,
    `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
    "NEXT_TELEMETRY_DISABLED=1",
    "DEMO_MODE=true",
    "ATLAS_ALLOW_LOCAL_HTTP=true",
    "DATABASE_URL=postgres://atlas:atlas_local_only@postgres:5432/atlas",
    "POSTGRES_DB=atlas",
    "POSTGRES_USER=atlas",
    "POSTGRES_PASSWORD=atlas_local_only",
    "S3_ENDPOINT=http://objectstore:8333",
    "S3_REGION=us-east-1",
    "S3_ACCESS_KEY_ID=atlas_local",
    "S3_SECRET_ACCESS_KEY=atlas_s3_local_only",
    "S3_BUCKET=atlas-private-documents",
    ""
  ].join("\n");
  writeFileSync(path, contents, { mode: 0o600, flag: "wx" });
  return { created: true, appUrl };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = prepareBrowserEnvironment(root, process.env);
  console.info(result.created ? "Private Demo-Konfiguration angelegt." : "Vorhandene Demo-Konfiguration erhalten.");
  console.info(`ATLAS-Browseradresse: ${result.appUrl}`);
}
