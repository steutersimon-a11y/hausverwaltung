import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";
import { afterEach, describe, expect, it } from "vitest";
import { browserOrigin, prepareBrowserEnvironment } from "../../scripts/prepare-browser";

const runtime = { CODESPACES: "true", CODESPACE_NAME: "atlas-private-example", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" };
const temporaryRoots: string[] = [];
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-browser-"));
  temporaryRoots.push(root);
  return root;
}
afterEach(() => temporaryRoots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe("private browser preview setup", () => {
  it("uses the exact forwarded HTTPS origin, with loopback only outside Codespaces", () => {
    expect(browserOrigin(runtime)).toBe("https://atlas-private-example-3000.app.github.dev");
    expect(browserOrigin({})).toBe("http://127.0.0.1:3000");
  });

  it.each([
    { CODESPACES: "true" },
    { ...runtime, CODESPACE_NAME: "atlas\nAPP_URL=https://other.example" },
    { ...runtime, CODESPACE_NAME: "a".repeat(59) },
    { ...runtime, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "https://app.github.dev" },
    { ...runtime, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "*.github.dev" },
    { ...runtime, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev/path" }
  ])("rejects missing or malformed browser origins", invalidRuntime => {
    expect(() => browserOrigin(invalidRuntime)).toThrow("Browseradresse");
  });

  it("creates private development config with internal service addresses and a unique auth secret", () => {
    const root = temporaryRoot();
    const otherRoot = temporaryRoot();
    expect(prepareBrowserEnvironment(root, runtime).created).toBe(true);
    prepareBrowserEnvironment(otherRoot, runtime);
    const values = parse(readFileSync(join(root, ".env")));
    const other = parse(readFileSync(join(otherRoot, ".env")));
    expect(values.APP_URL).toBe(browserOrigin(runtime));
    expect(values.BETTER_AUTH_URL).toBe(values.APP_URL);
    expect(values.BETTER_AUTH_SECRET).toHaveLength(64);
    expect(values.BETTER_AUTH_SECRET).not.toBe(other.BETTER_AUTH_SECRET);
    expect(values.DATABASE_URL).toBe("postgres://atlas:atlas_local_only@postgres:5432/atlas");
    expect(values.S3_ENDPOINT).toBe("http://objectstore:8333");
    expect(values.DEMO_MODE).toBe("true");
    expect(statSync(join(root, ".env")).mode & 0o777).toBe(0o600);
  });

  it("preserves existing secrets and settings on container restart", () => {
    const root = temporaryRoot();
    prepareBrowserEnvironment(root, runtime);
    const path = join(root, ".env");
    const original = readFileSync(path, "utf8") + "CUSTOM_SETTING=keep\n";
    writeFileSync(path, original);
    expect(prepareBrowserEnvironment(root, runtime).created).toBe(false);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("retains a preexisting configuration and stops on a mismatched auth origin", () => {
    const root = temporaryRoot();
    const path = join(root, ".env");
    const original = "APP_URL=http://127.0.0.1:3000\nBETTER_AUTH_URL=http://127.0.0.1:3000\n";
    writeFileSync(path, original);
    expect(() => prepareBrowserEnvironment(root, runtime)).toThrow("erhalten");
    expect(readFileSync(path, "utf8")).toBe(original);
  });
});
