import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LOCAL_MAP_PROVIDER, mapProviderStyle } from "../../apps/web/src/lib/map-provider";

describe("map provider defaults", () => {
  it("serves the unmodified worker matching the installed MapLibre package", () => {
    const installed = readFileSync(new URL("../../apps/web/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url));
    const shipped = readFileSync(new URL("../../apps/web/public/vendor/maplibre-gl-worker-6.16.0.mjs", import.meta.url));
    expect(shipped.equals(installed)).toBe(true);
    expect(readFileSync(new URL("../../apps/web/public/vendor/MAPLIBRE-LICENSE.txt", import.meta.url), "utf8"))
      .toContain("Redistribution");
  });

  it("uses no external tiles, fonts or sprite URLs by default", () => {
    const style = mapProviderStyle(LOCAL_MAP_PROVIDER, "dark");
    expect(style).toMatchObject({ version: 8, sources: {} });
    expect(style).not.toHaveProperty("glyphs");
    expect(style).not.toHaveProperty("sprite");
    expect(JSON.stringify(style)).not.toContain("https://");
  });

  it("only accepts an explicitly configured HTTPS provider", () => {
    expect(mapProviderStyle({ kind: "vector", styleUrl: "https://maps.example.test/style.json", externalRequestsApproved: true }, "light"))
      .toBe("https://maps.example.test/style.json");
    expect(() => mapProviderStyle({ kind: "vector", styleUrl: "http://maps.example.test/style.json", externalRequestsApproved: true }, "dark"))
      .toThrow("HTTPS");
  });
});
