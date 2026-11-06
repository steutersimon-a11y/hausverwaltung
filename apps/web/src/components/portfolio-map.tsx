"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import * as maplibregl from "maplibre-gl";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as LibreMap,
  MapMouseEvent,
  Marker,
} from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import type { PropertySummary } from "@atlas/db/contracts";
import { buildingFeatures, type BuildingProperties } from "@/lib/portfolio-geometry";
import { LOCAL_MAP_PROVIDER, mapProviderStyle, type MapProviderConfiguration, type MapTheme } from "@/lib/map-provider";
import "maplibre-gl/dist/maplibre-gl.css";
import styles from "./portfolio-map.module.css";

interface PortfolioMapProps {
  properties: readonly PropertySummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
  provider?: MapProviderConfiguration;
}

interface HoveredProperty {
  property: PropertySummary;
  x: number;
  y: number;
  viewportWidth: number;
}

type MapState = "loading" | "ready" | "unavailable";
const BUILDING_SOURCE = "atlas-own-buildings";
const GRID_SOURCE = "atlas-local-grid";
const SURFACE_LAYER = "atlas-footprints";
const BUILDING_LAYER = "atlas-buildings-3d";
const GRID_LAYER = "atlas-grid";
const OUTLINE_LAYER = "atlas-footprint-outlines";

function boundsOfFeatures(features: FeatureCollection<Polygon, BuildingProperties>) {
  const bounds = new maplibregl.LngLatBounds();
  for (const feature of features.features) {
    for (const ring of feature.geometry.coordinates) {
      for (const position of ring) bounds.extend([position[0]!, position[1]!]);
    }
  }
  return bounds;
}

/** Metric orientation grid only. It intentionally does not invent roads or real places. */
function gridFeatures(features: FeatureCollection<Polygon, BuildingProperties>): FeatureCollection<LineString> {
  if (!features.features.length) return { type: "FeatureCollection", features: [] };
  const bounds = boundsOfFeatures(features);
  const latitude = bounds.getCenter().lat;
  const metersPerDegreeX = 111_320 * Math.cos(latitude * Math.PI / 180);
  const metersPerDegreeY = 111_320;
  const widthM = (bounds.getEast() - bounds.getWest()) * metersPerDegreeX;
  const heightM = (bounds.getNorth() - bounds.getSouth()) * metersPerDegreeY;
  const stepM = Math.max(10, 10 ** Math.floor(Math.log10(Math.max(widthM, heightM, 100) / 15)));
  const padM = Math.max(100, Math.max(widthM, heightM) * 0.4);
  const west = bounds.getWest() - padM / metersPerDegreeX;
  const east = bounds.getEast() + padM / metersPerDegreeX;
  const south = bounds.getSouth() - padM / metersPerDegreeY;
  const north = bounds.getNorth() + padM / metersPerDegreeY;
  const lines: Feature<LineString>[] = [];
  const stepX = stepM / metersPerDegreeX;
  const stepY = stepM / metersPerDegreeY;
  for (let x = Math.floor(west / stepX) * stepX; x <= east && lines.length < 100; x += stepX) {
    lines.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[x, south], [x, north]] }, properties: {} });
  }
  for (let y = Math.floor(south / stepY) * stepY; y <= north && lines.length < 200; y += stepY) {
    lines.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[west, y], [east, y]] }, properties: {} });
  }
  return { type: "FeatureCollection", features: lines };
}

const getTheme = (): MapTheme => document.documentElement.dataset.theme === "light" ? "light" : "dark";
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const subscribeTheme = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};
const serverTheme = (): MapTheme => "dark";

function FitIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function NorthIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 6 17-6-4-6 4 6-17Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

export function PortfolioMap({ properties, selectedId, onSelect, className = "", provider = LOCAL_MAP_PROVIDER }: PortfolioMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const propertiesRef = useRef(properties);
  const selectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const fittedRef = useRef(false);
  const flatRef = useRef(false);
  const focusedKeyRef = useRef<string | null>(null);
  const visibleIdsRef = useRef("");
  const [mapState, setMapState] = useState<MapState>("loading");
  const [renderedBuildingCount, setRenderedBuildingCount] = useState(0);
  const [hovered, setHovered] = useState<HoveredProperty | null>(null);
  const [flat, setFlat] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, serverTheme);
  const geoData = useMemo(() => buildingFeatures(properties), [properties]);
  const mappedPropertyIds = useMemo(() => new Set(geoData.features.map((feature) => feature.properties.propertyId)), [geoData]);
  const displayedProperties = useMemo(() => properties.filter((property) => mappedPropertyIds.has(property.id)), [mappedPropertyIds, properties]);
  const demoOnly = displayedProperties.length > 0 && displayedProperties.every((property) => property.source === "demo");
  const hasHeights = geoData.features.some((feature) => feature.properties.heightKnown);
  const unplacedCount = properties.length - displayedProperties.length;

  useEffect(() => {
    propertiesRef.current = properties;
    selectRef.current = onSelect;
    selectedRef.current = selectedId;
  }, [properties, onSelect, selectedId]);

  const fitAll = useCallback(() => {
    const map = mapRef.current;
    const data = buildingFeatures(propertiesRef.current);
    if (!map || !data.features.length) return;
    map.fitBounds(boundsOfFeatures(data), {
      padding: { top: 105, bottom: 115, left: 50, right: 50 },
      maxZoom: 19,
      pitch: flatRef.current ? 0 : 55,
      bearing: flatRef.current ? 0 : -24,
      duration: prefersReducedMotion() ? 0 : 850,
    });
    setHovered(null);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const currentTheme = getTheme();
    let map: LibreMap;
    try {
      // MapLibre's import.meta.url worker lookup is not preserved by Turbopack.
      // Serve the matching, BSD-licensed module worker from this origin instead.
      maplibregl.setWorkerUrl(new URL("/vendor/maplibre-gl-worker-6.16.0.mjs", window.location.origin).href);
      maplibregl.setWorkerCount(2);
      map = new maplibregl.Map({
        container: canvasRef.current,
        style: mapProviderStyle(provider, currentTheme),
        center: [0, 0],
        zoom: 16,
        pitch: flatRef.current ? 0 : 55,
        bearing: -24,
        minZoom: 2,
        maxZoom: 22,
        maxPitch: 75,
        attributionControl: { compact: true },
        renderWorldCopies: false,
        canvasContextAttributes: { antialias: true, preserveDrawingBuffer: false },
      });
    } catch {
      queueMicrotask(() => setMapState("unavailable"));
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(canvasRef.current);
    map.on("load", () => {
      map.addSource(GRID_SOURCE, { type: "geojson", data: gridFeatures(buildingFeatures(propertiesRef.current)) });
      map.addLayer({
        id: GRID_LAYER,
        type: "line",
        source: GRID_SOURCE,
        paint: { "line-color": currentTheme === "light" ? "#c2d2c7" : "#29404d", "line-width": 0.75, "line-opacity": 0.6 },
      });
      map.addSource(BUILDING_SOURCE, { type: "geojson", data: buildingFeatures(propertiesRef.current) });
      map.addLayer({
        id: SURFACE_LAYER,
        type: "fill",
        source: BUILDING_SOURCE,
        paint: { "fill-color": "#7aab9c", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: OUTLINE_LAYER,
        type: "line",
        source: BUILDING_SOURCE,
        paint: { "line-color": "#9bc6b8", "line-width": 1.25, "line-opacity": 0.65 },
      });
      map.addLayer({
        id: BUILDING_LAYER,
        type: "fill-extrusion",
        source: BUILDING_SOURCE,
        filter: [">", ["get", "heightM"], 0],
        paint: {
          "fill-extrusion-color": "#83beab",
          "fill-extrusion-height": ["get", "heightM"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.96,
          "fill-extrusion-vertical-gradient": true,
        },
      });
    });

    map.on("sourcedata", (event) => {
      if (event.sourceId === BUILDING_SOURCE && event.isSourceLoaded && map.getLayer(BUILDING_LAYER)) {
        setMapState("ready");
      }
    });
    map.on("idle", () => {
      if (!map.getLayer(BUILDING_LAYER)) return;
      const rendered = map.queryRenderedFeatures(undefined, { layers: [BUILDING_LAYER] });
      const count = new Set(rendered.map((feature) => feature.properties?.buildingId)).size;
      setRenderedBuildingCount((current) => current === count ? current : count);
    });

    const pickProperty = (event: MapMouseEvent) => {
      const layers = [BUILDING_LAYER, SURFACE_LAYER].filter((id) => map.getLayer(id));
      if (!layers.length) return undefined;
      const features = map.queryRenderedFeatures(event.point, { layers });
      const id = features[0]?.properties?.propertyId as string | undefined;
      return propertiesRef.current.find((property) => property.id === id);
    };
    map.on("mousemove", (event) => {
      const property = pickProperty(event);
      map.getCanvas().style.cursor = property ? "pointer" : "";
      if (property) setHovered({ property, x: event.point.x, y: event.point.y, viewportWidth: map.getCanvas().clientWidth });
      else setHovered(null);
    });
    map.on("click", (event) => {
      const property = pickProperty(event);
      if (property) { selectRef.current(property.id); setHovered(null); }
    });
    map.on("movestart", () => setHovered(null));
    map.getCanvas().addEventListener("mouseleave", () => setHovered(null));
    map.getCanvas().addEventListener("webglcontextlost", (event) => {
      event.preventDefault(); setMapState("unavailable");
    });
    // No external requests exist in the default provider, and errors never log property data.
    map.on("error", (event) => {
      if (!map.isStyleLoaded() || /worker/i.test(event.error.message)) setMapState("unavailable");
    });
    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((marker) => marker.remove()); markersRef.current = [];
      map.remove(); mapRef.current = null;
    };
    // Map lifetime is intentionally independent of filter, selection and form changes.
  }, [provider]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready" || provider.kind !== "local") return;
    if (map.getLayer("atlas-background")) map.setPaintProperty("atlas-background", "background-color", theme === "light" ? "#e8eee8" : "#121f2a");
    if (map.getLayer(GRID_LAYER)) map.setPaintProperty(GRID_LAYER, "line-color", theme === "light" ? "#c2d2c7" : "#29404d");
  }, [mapState, provider.kind, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    (map.getSource(BUILDING_SOURCE) as GeoJSONSource | undefined)?.setData(geoData);
    (map.getSource(GRID_SOURCE) as GeoJSONSource | undefined)?.setData(gridFeatures(geoData));
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    for (const property of displayedProperties) {
      const label = document.createElement("button");
      label.type = "button";
      label.className = styles.propertyLabel!;
      label.textContent = property.code;
      label.dataset.propertyId = property.id;
      label.dataset.selected = String(property.id === selectedRef.current);
      label.dataset.theme = theme;
      label.setAttribute("aria-label", `${property.name}, ${property.unitCount} Einheiten, Objekt öffnen`);
      label.setAttribute("aria-pressed", String(property.id === selectedRef.current));
      label.addEventListener("click", (event) => { event.stopPropagation(); selectRef.current(property.id); });
      label.addEventListener("focus", () => {
        const point = map.project([property.longitude!, property.latitude!]);
        setHovered({ property, x: point.x, y: point.y, viewportWidth: map.getCanvas().clientWidth });
      });
      label.addEventListener("blur", () => setHovered(null));
      const marker = new maplibregl.Marker({ element: label, anchor: "top", offset: [0, 13] })
        .setLngLat([property.longitude!, property.latitude!]).addTo(map);
      markersRef.current.push(marker);
    }
    const visibleKey = displayedProperties.map((property) => property.id).sort().join(":");
    const visibleChanged = visibleIdsRef.current !== visibleKey;
    visibleIdsRef.current = visibleKey;
    if (geoData.features.length && (!fittedRef.current || (visibleChanged && !displayedProperties.some((property) => property.id === selectedRef.current)))) {
      fittedRef.current = true;
      fitAll();
    }
  }, [displayedProperties, fitAll, geoData, mapState, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    const selectedMatch: ExpressionSpecification = ["==", ["get", "propertyId"], selectedId ?? ""];
    map.setPaintProperty(BUILDING_LAYER, "fill-extrusion-color", ["case", selectedMatch, "#d9c5a2", [">", ["get", "vacantUnits"], 0], "#a9957a", "#83beab"]);
    map.setPaintProperty(OUTLINE_LAYER, "line-color", ["case", selectedMatch, "#efdfc2", "#9bc6b8"]);
    for (const marker of markersRef.current) {
      const markerSelected = marker.getElement().dataset.propertyId === selectedId;
      marker.getElement().dataset.selected = String(markerSelected);
      marker.getElement().setAttribute("aria-pressed", String(markerSelected));
    }
    const property = displayedProperties.find((candidate) => candidate.id === selectedId);
    const focusKey = property ? `${property.id}:${property.longitude}:${property.latitude}` : null;
    if (property && focusKey !== focusedKeyRef.current) {
      // A management object can contain several buildings. Frame the stored
      // footprints together instead of centring only its address point.
      const bounds = new maplibregl.LngLatBounds();
      const points = geoData.features.filter(feature => feature.properties.propertyId === property.id)
        .flatMap(feature => feature.geometry.coordinates.flat());
      for (const point of points) bounds.extend([point[0]!, point[1]!]);
      if (!bounds.isEmpty()) {
        const sidePadding = map.getCanvas().clientWidth < 600 ? 45 : 80;
        map.fitBounds(bounds, { padding: { top: 105, bottom: 95, left: sidePadding, right: sidePadding }, maxZoom: 18.9,
          pitch: flatRef.current ? 0 : 58, bearing: flatRef.current ? 0 : -24, duration: prefersReducedMotion() ? 0 : 900 });
      }
    }
    focusedKeyRef.current = focusKey;
    queueMicrotask(() => setHovered(null));
  }, [displayedProperties, geoData, mapState, selectedId]);

  function togglePerspective() {
    const next = !flat; flatRef.current = next; setFlat(next);
    mapRef.current?.easeTo({ pitch: next ? 0 : 58, duration: prefersReducedMotion() ? 0 : 450 });
  }

  return (
    <section ref={containerRef} className={`${styles.root} ${className}`} data-theme={theme} data-testid="portfolio-map" data-map-state={mapState} data-rendered-buildings={renderedBuildingCount} aria-label="Interaktive räumliche Objektansicht">
      <div ref={canvasRef} className={styles.canvas} aria-label="Kartenfläche: Objekte auch über die Liste auswählbar" />
      <div className={styles.heading}>
        <div className={styles.location}><span className={styles.liveDot} /> {demoOnly ? "ATLAS DEMOCAMPUS" : "EURE VERWALTUNGSOBJEKTE"}</div>
        <p>{provider.kind === "local" ? "Lokale Ansicht · keine externen Kartendienste" : "Freigegebener Vektor-Kartendienst"}</p>
      </div>
      <div className={styles.modeBadge}>{demoOnly ? "FIKTIVE GEOMETRIEN" : displayedProperties.length ? "GEPRÜFTE STANDORTE" : "ZUORDNUNG OFFEN"}<span />{hasHeights ? "STILISIERTE 3D-ANSICHT" : "GEBÄUDEGRUNDRISSE"}</div>
      {mapState === "loading" && <div className={styles.loading} role="status"><span />Räumliche Ansicht wird geladen …</div>}
      {mapState === "unavailable" && <div className={styles.fallback} role="status"><span className={styles.fallbackIcon}>⌑</span><h3>Die Liste bleibt euer Überblick.</h3><p>Diese Umgebung kann die 3D-Ansicht gerade nicht darstellen. Alle Objekte, Einheiten und Aktionen sind über die Objektliste erreichbar.</p><button type="button" onClick={() => window.location.reload()}>Ansicht erneut laden</button></div>}
      {mapState === "ready" && !displayedProperties.length && <div className={styles.fallback} role="status"><h3>Noch kein geprüfter Standort.</h3><p>Die ausgewählten Objekte bleiben in der Liste. Sobald Koordinaten und Gebäudeumrisse bestätigt sind, erscheinen sie hier.</p></div>}
      {hovered && mapState === "ready" && <div className={styles.tooltip} role="tooltip" style={{ left: Math.max(12, Math.min(hovered.x + 16, hovered.viewportWidth - 260)), top: Math.max(90, hovered.y - 128) }}><span className={styles.tooltipCode}>{hovered.property.code}{hovered.property.source === "demo" ? " · DEMO" : ""}</span><strong>{hovered.property.name}</strong><div><span>{hovered.property.unitCount} Einheiten</span><span>{hovered.property.vacantUnitCount} frei</span><span>{hovered.property.openTaskCount} Vorgänge</span></div><small>{hovered.property.source === "demo" ? "Fiktiver Baukörper · kein Architekturmodell" : "Stilisierte Annäherung · Gebäudeumfang prüfen"}</small></div>}
      <div className={styles.controls} role="group" aria-label="Kartenansicht steuern">
        <button type="button" title="Alle zugeordneten Objekte anzeigen" aria-label="Alle zugeordneten Objekte anzeigen" disabled={mapState !== "ready" || !displayedProperties.length} onClick={fitAll}><FitIcon /></button>
        <button type="button" title="Nach Norden ausrichten" aria-label="Karte nach Norden ausrichten" disabled={mapState !== "ready"} onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: prefersReducedMotion() ? 0 : 450 })}><NorthIcon /><small>N</small></button>
        <button type="button" title={flat ? "3D-Perspektive anzeigen" : "2D-Draufsicht anzeigen"} aria-label={flat ? "3D-Perspektive anzeigen" : "2D-Draufsicht anzeigen"} aria-pressed={!flat} disabled={mapState !== "ready"} onClick={togglePerspective}>{flat ? "3D" : "2D"}</button>
      </div>
      <div className={styles.legend}><span className={styles.legendSwatch} /><span>{displayedProperties.length} {displayedProperties.length === 1 ? "Objekt" : "Objekte"} räumlich zugeordnet</span>{unplacedCount > 0 && <span className={styles.unplaced}>{unplacedCount} in Klärung</span>}</div>
      <p className={styles.gesture}>Ziehen: bewegen · Rechts ziehen: drehen · Scrollen: zoomen</p>
    </section>
  );
}
