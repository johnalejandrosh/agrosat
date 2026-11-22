/**
 * Lectura de las bandas Landsat (COG) solo en la ventana de la parcela y cálculo de índices
 * (RF-04, RF-05). Se descargan unos pocos bloques de 256 × 256 píxeles por banda, nunca la escena completa.
 *
 *   NDVI = (B5 − B4) / (B5 + B4)      vigor de la vegetación (Rouse et al., 1974)
 *   NDWI = (B5 − B6) / (B5 + B6)      agua en las hojas (Gao, 1996)
 */
import { fromUrl, type GeoTIFF, type GeoTIFFImage } from "geotiff";
import proj4 from "proj4";
import { centroid, openRing, pointInRing, type LonLat } from "@/lib/agro/geo";
import { LANDSAT, QA_FILL, QA_MASK } from "./config";
import { LandsatError, signHref, type SceneInfo } from "./stac";

/** Proyección de la escena: Landsat Colección 2 usa UTM WGS84 (EPSG 326xx / 327xx). */
function projectionFor(epsg: number): string {
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
  throw new LandsatError(`Proyección no soportada: EPSG:${epsg}.`);
}

/**
 * Archivos abiertos durante un procesamiento. Varias parcelas de la misma escena comparten
 * el encabezado y los bloques ya descargados.
 */
export class RasterCache {
  private files = new Map<string, Promise<GeoTIFFImage>>();

  image(href: string): Promise<GeoTIFFImage> {
    let image = this.files.get(href);
    if (!image) {
      image = signHref(href)
        // `cacheSize` (bloques en memoria) llega a BlockedSource aunque el tipo de fromUrl no lo declare.
        .then((url) => fromUrl(url, { allowFullFile: false, cacheSize: 200 } as Parameters<typeof fromUrl>[1]))
        .then((tiff: GeoTIFF) => tiff.getImage());
      // Si falla, se olvida para poder reintentar.
      image.catch(() => this.files.delete(href));
      this.files.set(href, image);
    }
    return image;
  }

  clear() {
    this.files.clear();
  }
}

export type Pixel = {
  /** Esquinas del píxel en WGS84: [[lat, lon] ×4]. */
  c: [number, number][];
  v: number | null;
  w: number | null;
  /** Descartado por nubes, sombra, cirro o nieve (QA_PIXEL). */
  n: boolean;
};

export type ParcelObservation = {
  pixelCount: number;
  clearCount: number;
  cloudPct: number;
  valid: boolean;
  ndvi: number | null;
  ndwi: number | null;
  pixels: Pixel[];
};

type Window = { col0: number; row0: number; width: number; height: number };

async function readWindow(cache: RasterCache, href: string, w: Window): Promise<ArrayLike<number>> {
  const image = await cache.image(href);
  const rasters = await image.readRasters({ window: [w.col0, w.row0, w.col0 + w.width, w.row0 + w.height], samples: [0] });
  return (rasters as unknown as ArrayLike<number>[])[0];
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const reflectance = (dn: number) => dn * LANDSAT.scale + LANDSAT.offset;

/** Índice normalizado (a − b) / (a + b); `null` si no es calculable. */
function normalized(a: number, b: number): number | null {
  const s = a + b;
  if (!Number.isFinite(s) || Math.abs(s) < 1e-6) return null;
  const v = (a - b) / s;
  return v >= -1 && v <= 1 ? v : null;
}

/**
 * Calcula la observación de una parcela en una escena. Devuelve `null` si la parcela
 * queda fuera de la imagen o en una zona sin datos (borde de escena).
 */
export async function observeParcel(cache: RasterCache, scene: SceneInfo, ring: LonLat[]): Promise<ParcelObservation | null> {
  const proj = projectionFor(scene.epsg);
  const toUtm = (p: LonLat) => proj4("EPSG:4326", proj, p) as [number, number];
  const toWgs = (p: [number, number]) => proj4(proj, "EPSG:4326", p) as [number, number];

  const polygon = openRing(ring).map(toUtm);
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);

  const qaImage = await cache.image(scene.assets.qa);
  const [ox, oy] = qaImage.getOrigin();
  const [rx, ry] = qaImage.getResolution(); // ry es negativo (filas hacia el sur)

  const col0 = Math.max(0, Math.floor((Math.min(...xs) - ox) / rx));
  const col1 = Math.min(qaImage.getWidth(), Math.ceil((Math.max(...xs) - ox) / rx));
  const row0 = Math.max(0, Math.floor((Math.max(...ys) - oy) / ry));
  const row1 = Math.min(qaImage.getHeight(), Math.ceil((Math.min(...ys) - oy) / ry));
  if (col1 <= col0 || row1 <= row0) return null;
  const win: Window = { col0, row0, width: col1 - col0, height: row1 - row0 };

  // Píxeles cuyo centro cae dentro de la parcela; si es más pequeña que un píxel, el que contiene su centro.
  const inside: number[] = [];
  for (let r = 0; r < win.height; r++) {
    for (let c = 0; c < win.width; c++) {
      const x = ox + (col0 + c + 0.5) * rx;
      const y = oy + (row0 + r + 0.5) * ry;
      if (pointInRing([x, y], polygon)) inside.push(r * win.width + c);
    }
  }
  if (inside.length === 0) {
    const [cx, cy] = toUtm(centroid(ring));
    const c = Math.floor((cx - ox) / rx) - col0;
    const r = Math.floor((cy - oy) / ry) - row0;
    if (c < 0 || r < 0 || c >= win.width || r >= win.height) return null;
    inside.push(r * win.width + c);
  }

  const qa = await readWindow(cache, scene.assets.qa, win);
  const withData = inside.filter((k) => (qa[k] & QA_FILL) === 0 && qa[k] !== 0);
  if (withData.length === 0) return null;

  const clearSet = new Set(withData.filter((k) => (qa[k] & QA_MASK) === 0));
  const cloudPct = (100 * (withData.length - clearSet.size)) / withData.length;
  const valid = cloudPct <= LANDSAT.maxParcelCloud && clearSet.size > 0;

  // Solo se descargan las bandas de reflectancia si la fecha sirve: ahorra 3 de cada 4 lecturas en días nublados.
  let values: { red: ArrayLike<number>; nir: ArrayLike<number>; swir: ArrayLike<number> } | null = null;
  if (valid) {
    const [red, nir, swir] = await Promise.all([
      readWindow(cache, scene.assets.red, win),
      readWindow(cache, scene.assets.nir, win),
      readWindow(cache, scene.assets.swir, win),
    ]);
    values = { red, nir, swir };
  }

  const pixels: Pixel[] = [];
  let sumV = 0;
  let sumW = 0;
  let nV = 0;
  let nW = 0;
  for (const k of withData) {
    const c = col0 + (k % win.width);
    const r = row0 + Math.floor(k / win.width);
    const corners = [
      [ox + c * rx, oy + r * ry],
      [ox + (c + 1) * rx, oy + r * ry],
      [ox + (c + 1) * rx, oy + (r + 1) * ry],
      [ox + c * rx, oy + (r + 1) * ry],
    ].map((p) => {
      const [lon, lat] = toWgs(p as [number, number]);
      return [round6(lat), round6(lon)] as [number, number];
    });

    const cloudy = !clearSet.has(k);
    let v: number | null = null;
    let w: number | null = null;
    if (!cloudy && values && values.red[k] > 0 && values.nir[k] > 0 && values.swir[k] > 0) {
      const red = reflectance(values.red[k]);
      const nir = reflectance(values.nir[k]);
      const swir = reflectance(values.swir[k]);
      v = normalized(nir, red);
      w = normalized(nir, swir);
      if (v !== null) {
        sumV += v;
        nV++;
      }
      if (w !== null) {
        sumW += w;
        nW++;
      }
    }
    pixels.push({ c: corners, v: v === null ? null : Math.round(v * 1000) / 1000, w: w === null ? null : Math.round(w * 1000) / 1000, n: cloudy });
  }

  const ok = valid && nV > 0 && nW > 0;
  return {
    pixelCount: withData.length,
    clearCount: clearSet.size,
    cloudPct: Math.round(cloudPct * 10) / 10,
    valid: ok,
    ndvi: ok ? Math.round((sumV / nV) * 10_000) / 10_000 : null,
    ndwi: ok ? Math.round((sumW / nW) * 10_000) / 10_000 : null,
    pixels,
  };
}
