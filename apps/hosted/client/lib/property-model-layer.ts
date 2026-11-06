import * as THREE from "three";
import { MercatorCoordinate, LngLatBounds } from "maplibre-gl";
import type { CustomLayerInterface, Map as LibreMap, PointLike } from "maplibre-gl";
import type { MapTheme } from "./map-provider";
import type { MapProperty } from "./portfolio-geometry";

interface ModelSurface { kind: string; rings: number[][] }
interface ModelBuilding { vertices: [number, number, number][]; surfaces: ModelSurface[] }
export interface PropertyModel { origin: [number, number]; buildings: ModelBuilding[]; source: string; license: string }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Model bytes are untrusted uploads. No coordinates or surfaces are inferred here. */
export function parsePropertyModel(value: unknown): PropertyModel {
  if (!record(value) || !Array.isArray(value.origin) || value.origin.length !== 2 ||
      !value.origin.every(finite) || Math.abs(value.origin[0]) > 180 || Math.abs(value.origin[1]) > 85 ||
      !Array.isArray(value.buildings) || !value.buildings.length || value.buildings.length > 50) {
    throw new Error("Das Gebäudemodell hat kein unterstütztes Koordinatenformat.");
  }
  const buildings: ModelBuilding[] = value.buildings.map((building: unknown) => {
    if (!record(building) || !Array.isArray(building.vertices) || !building.vertices.length || building.vertices.length > 100_000 ||
        !building.vertices.every((vertex: unknown) => Array.isArray(vertex) && vertex.length === 3 && vertex.every(finite)) ||
        !Array.isArray(building.surfaces) || !building.surfaces.length || building.surfaces.length > 100_000) {
      throw new Error("Die Gebäudeflächen konnten nicht gelesen werden.");
    }
    const vertices = building.vertices as [number, number, number][];
    const surfaces = building.surfaces.map((surface: unknown): ModelSurface => {
      if (!record(surface) || typeof surface.kind !== "string" || !Array.isArray(surface.rings) || !surface.rings.length ||
          !surface.rings.every((ring: unknown) => Array.isArray(ring) && ring.length >= 3 && ring.length <= 10_000 &&
            ring.every((index: unknown) => Number.isInteger(index) && typeof index === "number" && index >= 0 && index < vertices.length))) {
        throw new Error("Das Gebäudemodell enthält eine ungültige Fläche.");
      }
      return { kind: surface.kind, rings: surface.rings as number[][] };
    });
    return { vertices, surfaces };
  });
  return { origin: value.origin as [number, number], buildings,
    source: typeof value.source === "string" ? value.source : "Quelle offen",
    license: typeof value.license === "string" ? value.license : "Nutzungsrechte prüfen" };
}

/** Triangulate each original planar face, including holes; never replace roofs with boxes. */
export function triangulateSurface(vertices: readonly [number, number, number][], surface: ModelSurface): number[] {
  const rings = surface.rings.map((ring) => ring.length > 3 && ring[0] === ring.at(-1) ? ring.slice(0, -1) : ring);
  const outer = rings[0]!.map((index) => new THREE.Vector3(...vertices[index]!));
  const normal = new THREE.Vector3();
  for (let index = 0; index < outer.length; index++) {
    const a = outer[index]!, b = outer[(index + 1) % outer.length]!;
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  if (normal.lengthSq() < 1e-12) return [];
  const axis = Math.abs(normal.x) > Math.abs(normal.y)
    ? (Math.abs(normal.x) > Math.abs(normal.z) ? 0 : 2) : (Math.abs(normal.y) > Math.abs(normal.z) ? 1 : 2);
  const project = (vertex: [number, number, number]) => axis === 0
    ? new THREE.Vector2(vertex[1], vertex[2]) : axis === 1
      ? new THREE.Vector2(vertex[0], vertex[2]) : new THREE.Vector2(vertex[0], vertex[1]);
  const points = rings.flatMap((ring) => ring.map((index) => vertices[index]!));
  return THREE.ShapeUtils.triangulateShape(rings[0]!.map((index) => project(vertices[index]!)),
    rings.slice(1).map((ring) => ring.map((index) => project(vertices[index]!))))
    .flatMap((triangle) => triangle.flatMap((index) => points[index]!));
}

interface LoadedModel { group: THREE.Group; bounds: LngLatBounds; url: string; buildingCount: number; attribution: string }
interface ModelLayerOptions {
  onRendered: (count: number) => void;
  onChange: () => void;
  onError: () => void;
}

export interface PropertyModelLayer {
  layer: CustomLayerInterface;
  setProperties: (properties: readonly MapProperty[]) => void;
  setAppearance: (selectedId: string | null, hoveredId: string | null, theme: MapTheme) => void;
  pick: (point: PointLike) => string | null;
  bounds: (propertyId?: string) => LngLatBounds;
  attribution: () => string[];
}

export function createPropertyModelLayer(options: ModelLayerOptions): PropertyModelLayer {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const raycaster = new THREE.Raycaster();
  const loaded = new Map<string, LoadedModel>();
  const pending = new Map<string, { url: string; abort: AbortController }>();
  let map: LibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let localToMercator: THREE.Matrix4 | null = null;
  let referenceInverse: THREE.Matrix4 | null = null;
  let properties: readonly MapProperty[] = [];
  let selectedId: string | null = null, hoveredId: string | null = null;
  let theme: MapTheme = "dark";
  let disposed = false, matrixReady = false, lastCount = -1;
  scene.add(new THREE.AmbientLight(0xffffff, 2.1));
  const sunlight = new THREE.DirectionalLight(0xfff7e8, 2.5);
  sunlight.position.set(-120, -170, 250); scene.add(sunlight);

  function disposeGroup(group: THREE.Group) {
    group.traverse((node) => {
      if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material.dispose());
      }
    });
    scene.remove(group);
  }

  function repaint() {
    const visible = new Set(properties.map((property) => property.id));
    for (const [id, model] of loaded) {
      model.group.visible = visible.has(id);
      model.group.traverse((node) => {
        if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) {
          const roof = node.userData.roof === true;
          node.material.color.set(id === selectedId ? (roof ? "#a28663" : "#e6d3ae")
            : id === hoveredId ? (roof ? "#82b7a6" : "#d0e4ce")
              : roof ? (theme === "dark" ? "#5d8e7d" : "#527d67") : (theme === "dark" ? "#a3c9b5" : "#c2d3b3"));
        }
      });
    }
    map?.triggerRepaint();
  }

  async function load(property: MapProperty) {
    const url = property.modelUrl;
    if (!url || loaded.get(property.id)?.url === url || pending.get(property.id)?.url === url) return;
    pending.get(property.id)?.abort.abort();
    const abort = new AbortController(); pending.set(property.id, { url, abort });
    try {
      const endpoint = new URL(url, window.location.origin);
      if (endpoint.origin !== window.location.origin || !endpoint.pathname.startsWith("/api/atlas/")) {
        throw new Error("Gebäudemodelle müssen aus dem geschützten Anwendungsspeicher stammen.");
      }
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("Das Gebäudemodell ist nicht erreichbar.");
      const payload = parsePropertyModel(await response.json());
      if (disposed || abort.signal.aborted) return;
      const origin = MercatorCoordinate.fromLngLat(payload.origin, 0);
      const meters = origin.meterInMercatorCoordinateUnits();
      const modelTransform = new THREE.Matrix4().makeTranslation(origin.x, origin.y, 0)
        .scale(new THREE.Vector3(meters, -meters, meters));
      if (!localToMercator) {
        localToMercator = modelTransform.clone(); referenceInverse = modelTransform.clone().invert();
      }
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.matrix.copy(referenceInverse!).multiply(modelTransform);
      const bounds = new LngLatBounds();
      for (const building of payload.buildings) {
        for (const vertex of building.vertices) {
          const location = new MercatorCoordinate(origin.x + vertex[0] * meters, origin.y - vertex[1] * meters, 0).toLngLat();
          bounds.extend(location);
        }
        for (const surface of building.surfaces) {
          const positions = triangulateSurface(building.vertices, surface);
          if (!positions.length) continue;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.userData.propertyId = property.id;
          mesh.userData.roof = surface.kind === "RoofSurface";
          group.add(mesh);
          group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25),
            new THREE.LineBasicMaterial({ color: "#466557", transparent: true, opacity: 0.5 })));
        }
      }
      if (!group.children.length) throw new Error("Das Gebäudemodell enthält keine darstellbaren Flächen.");
      const previous = loaded.get(property.id);
      if (previous) disposeGroup(previous.group);
      loaded.set(property.id, { group, bounds, url, buildingCount: payload.buildings.length,
        attribution: `${payload.source} · ${payload.license}` });
      scene.add(group); repaint(); options.onChange();
    } catch (error: unknown) {
      if (!disposed && !abort.signal.aborted) options.onError();
      // Error text and model payloads never leave this application through logs.
      void error;
    } finally {
      if (pending.get(property.id)?.abort === abort) pending.delete(property.id);
    }
  }

  const layer: CustomLayerInterface = {
    id: "atlas-original-property-models", type: "custom", renderingMode: "3d",
    onAdd(instance, gl) {
      map = instance;
      renderer = new THREE.WebGLRenderer({ canvas: instance.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false; renderer.outputColorSpace = THREE.SRGBColorSpace;
      properties.forEach((property) => { void load(property); });
    },
    render(_gl, input) {
      if (!renderer || !localToMercator) return;
      camera.projectionMatrix.fromArray(input.defaultProjectionData.mainMatrix).multiply(localToMercator);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      renderer.resetState(); renderer.render(scene, camera); matrixReady = true;
      const count = renderer.info.render.calls > 0 ? [...loaded.values()]
        .filter((model) => model.group.visible).reduce((sum, model) => sum + model.buildingCount, 0) : 0;
      if (lastCount !== count) { lastCount = count; options.onRendered(count); }
    },
    onRemove() {
      disposed = true;
      pending.forEach(({ abort }) => abort.abort()); pending.clear();
      loaded.forEach((model) => disposeGroup(model.group)); loaded.clear();
      renderer?.dispose(); renderer = null; map = null;
    },
  };
  return {
    layer,
    setProperties(next) { properties = next; repaint(); if (map) next.forEach((property) => { void load(property); }); },
    setAppearance(selected, hovered, nextTheme) { selectedId = selected; hoveredId = hovered; theme = nextTheme; repaint(); },
    pick(point) {
      if (!map || !matrixReady) return null;
      const position = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
      const x = position.x / map.getCanvas().clientWidth * 2 - 1;
      const y = 1 - position.y / map.getCanvas().clientHeight * 2;
      const near = new THREE.Vector3(x, y, -1).unproject(camera);
      const far = new THREE.Vector3(x, y, 1).unproject(camera);
      raycaster.ray.origin.copy(near); raycaster.ray.direction.copy(far).sub(near).normalize();
      scene.updateMatrixWorld(true);
      const targets: THREE.Object3D[] = [];
      loaded.forEach((model) => { if (model.group.visible) targets.push(...model.group.children.filter((node) => node instanceof THREE.Mesh)); });
      const hit = raycaster.intersectObjects(targets, false)[0];
      return hit ? String(hit.object.userData.propertyId) : null;
    },
    bounds(propertyId) {
      const bounds = new LngLatBounds();
      const visible = new Set(properties.map((property) => property.id));
      loaded.forEach((model, id) => {
        if (visible.has(id) && (!propertyId || propertyId === id) && !model.bounds.isEmpty()) bounds.extend(model.bounds);
      });
      return bounds;
    },
    attribution: () => [...new Set([...loaded.values()].map((model) => model.attribution))],
  };
}
