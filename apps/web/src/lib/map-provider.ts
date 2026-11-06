import type { StyleSpecification } from "maplibre-gl";

export type MapTheme = "dark" | "light";

/** External map requests are an explicit configuration decision, never a default. */
export type MapProviderConfiguration =
  | { kind: "local" }
  | {
      kind: "vector";
      styleUrl: string;
      externalRequestsApproved: true;
    };

export const LOCAL_MAP_PROVIDER: MapProviderConfiguration = { kind: "local" };

export function localMapStyle(theme: MapTheme): StyleSpecification {
  return {
    version: 8,
    name: "ATLAS · lokale Objektansicht",
    sources: {},
    layers: [
      {
        id: "atlas-background",
        type: "background",
        paint: { "background-color": theme === "light" ? "#e8eee8" : "#121f2a" },
      },
    ],
    light: { anchor: "viewport", color: "#fff3de", intensity: 0.42, position: [1.3, 155, 38] },
  };
}

export function mapProviderStyle(
  provider: MapProviderConfiguration,
  theme: MapTheme,
): StyleSpecification | string {
  if (provider.kind === "local") return localMapStyle(theme);
  const url = new URL(provider.styleUrl);
  if (url.protocol !== "https:" || provider.externalRequestsApproved !== true) {
    throw new Error("Ein externer Kartendienst benötigt eine freigegebene HTTPS-Konfiguration.");
  }
  return url.href;
}
