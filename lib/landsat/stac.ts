/**
 * Búsqueda de escenas Landsat 8/9 en un catálogo STAC (estándar SpatioTemporal Asset Catalog)
 * y firma de las URLs de los archivos COG (RF-03).
 */
import { bbox, pointInRing, type LonLat } from "@/lib/agro/geo";
import { LANDSAT } from "./config";

export type StacAsset = { href: string };

export type StacItem = {
  id: string;
  bbox?: number[];
  geometry?: { type: string; coordinates: unknown };
  properties: Record<string, unknown> & { datetime: string; platform?: string };
  assets: Record<string, StacAsset>;
};

type StacSearchResponse = {
  features: StacItem[];
  links?: { rel: string; href: string; method?: string; body?: Record<string, unknown> }[];
};

export class LandsatError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "LandsatError";
  }
}

/** fetch con reintentos ante límites de uso (429) y errores temporales del servidor. */
export async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * 2 ** i));
  }
  throw new LandsatError("No se pudo contactar el catálogo de imágenes Landsat.", lastError);
}

// ------------------------------------------------------------------ Escenas

export type SceneInfo = {
  id: string;
  platform: string;
  acquiredAt: Date;
  wrsPath: number;
  wrsRow: number;
  cloudCover: number | null;
  epsg: number;
  assets: { red: string; nir: string; swir: string; qa: string };
};

function epsgOf(item: StacItem): number | null {
  const code = item.properties["proj:code"] ?? item.properties["proj:epsg"];
  if (typeof code === "number") return code;
  if (typeof code === "string") {
    const match = /(\d{4,5})$/.exec(code);
    if (match) return Number(match[1]);
  }
  return null;
}

/** ¿El polígono del ítem contiene todos los vértices de la parcela? (descarta bordes de escena). */
function covers(item: StacItem, ring: LonLat[]): boolean {
  const g = item.geometry;
  if (!g) return true;
  const polygons: [number, number][][] =
    g.type === "Polygon"
      ? [(g.coordinates as [number, number][][])[0]]
      : g.type === "MultiPolygon"
        ? (g.coordinates as [number, number][][][]).map((p) => p[0])
        : [];
  if (polygons.length === 0) return true;
  return ring.every((p) => polygons.some((poly) => pointInRing(p, poly)));
}

function toScene(item: StacItem): SceneInfo | null {
  const { bands } = LANDSAT;
  const asset = (key: string) => item.assets[key]?.href;
  const epsg = epsgOf(item);
  const platform = String(item.properties.platform ?? "").toLowerCase();
  const [red, nir, swir, qa] = [asset(bands.red), asset(bands.nir), asset(bands.swir), asset(bands.qa)];
  if (!epsg || !red || !nir || !swir || !qa || !(LANDSAT.platforms as readonly string[]).includes(platform)) return null;
  const cloud = item.properties["eo:cloud_cover"];
  return {
    id: item.id,
    platform,
    acquiredAt: new Date(item.properties.datetime),
    wrsPath: Number(item.properties["landsat:wrs_path"] ?? 0),
    wrsRow: Number(item.properties["landsat:wrs_row"] ?? 0),
    cloudCover: typeof cloud === "number" ? cloud : null,
    epsg,
    assets: { red, nir, swir, qa },
  };
}

/**
 * Escenas que cubren la parcela entre `from` y `to`, de la más reciente a la más antigua.
 * En el traslape entre dos filas WRS de la misma pasada se conserva una sola escena por fecha.
 */
export async function searchScenes(ring: LonLat[], from: Date, to: Date): Promise<SceneInfo[]> {
  const [minLon, minLat, maxLon, maxLat] = bbox(ring);
  const body: Record<string, unknown> = {
    collections: [LANDSAT.collection],
    bbox: [minLon, minLat, maxLon, maxLat],
    datetime: `${from.toISOString()}/${to.toISOString()}`,
    query: { platform: { in: LANDSAT.platforms } },
    sortby: [{ field: "datetime", direction: "desc" }],
    limit: 250,
  };
  const headers = { "content-type": "application/json", accept: "application/geo+json" };
  // Primera página por POST; las siguientes siguen el enlace "next" (POST con body o GET).
  let request: { url: string; init: RequestInit } | null = {
    url: `${LANDSAT.stacUrl}/search`,
    init: { method: "POST", headers, body: JSON.stringify(body) },
  };
  const items: StacItem[] = [];

  for (let page = 0; request && page < 20; page++) {
    const response = await fetchWithRetry(request.url, request.init);
    if (!response.ok) {
      throw new LandsatError(`El catálogo STAC respondió ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const data = (await response.json()) as StacSearchResponse;
    items.push(...data.features);
    const next = data.links?.find((link) => link.rel === "next");
    request =
      !next || data.features.length === 0
        ? null
        : next.method === "POST" || next.body
          ? { url: next.href, init: { method: "POST", headers, body: JSON.stringify({ ...body, ...next.body }) } }
          : { url: next.href, init: { headers } };
  }

  const byDay = new Map<string, SceneInfo>();
  for (const item of items) {
    const scene = toScene(item);
    if (!scene || !covers(item, ring)) continue;
    const key = `${scene.platform}:${scene.acquiredAt.toISOString().slice(0, 10)}`;
    const current = byDay.get(key);
    // Entre dos filas de la misma pasada se prefiere la de menor nubosidad de escena.
    if (!current || (scene.cloudCover ?? 100) < (current.cloudCover ?? 100)) byDay.set(key, scene);
  }
  return [...byDay.values()].sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime());
}

// ------------------------------------------------------------------ Firma de URLs

let token: { value: string; expiresAt: number } | null = null;

/** Agrega el token SAS a la URL del archivo (Planetary Computer). Se reutiliza hasta que vence. */
export async function signHref(href: string): Promise<string> {
  if (!LANDSAT.signUrl) return href;
  if (!token || token.expiresAt - Date.now() < 5 * 60_000) {
    const response = await fetchWithRetry(LANDSAT.signUrl);
    if (!response.ok) throw new LandsatError(`No se pudo firmar el acceso a las imágenes (HTTP ${response.status}).`);
    const data = (await response.json()) as { token: string; "msft:expiry"?: string };
    token = { value: data.token, expiresAt: data["msft:expiry"] ? Date.parse(data["msft:expiry"]) : Date.now() + 30 * 60_000 };
  }
  return `${href}${href.includes("?") ? "&" : "?"}${token.value}`;
}
