/**
 * Geometría de parcelas en WGS84. Las coordenadas siguen el orden GeoJSON [lon, lat].
 * Sin dependencias: se usa en el servidor (validación) y en el navegador (área al dibujar).
 */

export type LonLat = [lon: number, lat: number];

/** Píxel Landsat de 30 × 30 m = 0,09 ha. */
export const PIXEL_HA = 0.09;
export const MIN_AREA_HA = 0.1;
/** AgroSat está pensado para pequeños productores (parcelas < 5 ha). */
export const RECOMMENDED_MAX_AREA_HA = 5;
/** Límite duro para no procesar lotes enormes por error. */
export const MAX_AREA_HA = 50;

/** Cierra el anillo (el último punto repite el primero), como exige GeoJSON. */
export function closeRing(ring: LonLat[]): LonLat[] {
  if (ring.length === 0) return ring;
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/** Puntos sin el cierre repetido. */
export function openRing(ring: LonLat[]): LonLat[] {
  if (ring.length > 1) {
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Proyección local equirectangular en metros (suficiente para lotes de pocas hectáreas). */
function toMeters(ring: LonLat[]): [number, number][] {
  const [lon0, lat0] = ring[0];
  const k = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return ring.map(([lon, lat]) => [(lon - lon0) * k, (lat - lat0) * 110_574]);
}

export function areaHa(ring: LonLat[]): number {
  const points = openRing(ring);
  if (points.length < 3) return 0;
  const m = toMeters(points);
  let sum = 0;
  for (let i = 0; i < m.length; i++) {
    const [x1, y1] = m[i];
    const [x2, y2] = m[(i + 1) % m.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2 / 10_000;
}

/** Centroide del área del polígono (no el promedio de vértices). */
export function centroid(ring: LonLat[]): LonLat {
  const points = openRing(ring);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function bbox(ring: LonLat[]): [minLon: number, minLat: number, maxLon: number, maxLat: number] {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/** Punto en polígono (ray casting). Funciona con coordenadas en cualquier sistema plano. */
export function pointInRing([x, y]: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const cross = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** ¿Algún par de lados no contiguos se cruza? (polígono "en forma de 8"). */
export function selfIntersects(ring: LonLat[]): boolean {
  const p = openRing(ring);
  const n = p.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Landsat cubre todo el planeta: solo se exige que la coordenada sea válida. */
export function isValidLonLat([lon, lat]: LonLat): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}


/** Valida un polígono dibujado o escrito. Devuelve el primer problema o `null`. */
export function validateRing(ring: LonLat[]): string | null {
  const points = openRing(ring);
  if (points.length < 3) return "Marque al menos 3 puntos del límite de la parcela.";
  if (points.length > 200) return "El límite tiene demasiados puntos (máximo 200).";
  if (!points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return "Hay coordenadas que no son números.";
  if (!points.every(isValidLonLat)) {
    return "Hay coordenadas fuera de rango. Revise el orden: latitud primero (entre -90 y 90), longitud después (entre -180 y 180).";
  }
  if (selfIntersects(points)) return "Los lados del polígono se cruzan. Marque las esquinas en orden, sin saltar.";
  const area = areaHa(points);
  if (area < MIN_AREA_HA) return `La parcela es muy pequeña: el mínimo es ${String(MIN_AREA_HA).replace(".", ",")} ha.`;
  if (area > MAX_AREA_HA) return `La parcela es demasiado grande (más de ${MAX_AREA_HA} ha). Divídala en lotes.`;
  return null;
}

/**
 * Convierte texto con una coordenada por línea ("4.88010, -74.08640") en un anillo [lon, lat].
 * Acepta separadores coma, punto y coma, tabulador o espacio, siempre con punto decimal.
 */
export function parseCoordinates(text: string): LonLat[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim().split(/[\s,;]+/).filter(Boolean).map(Number))
    .filter((values) => values.length >= 2 && values.every(Number.isFinite))
    .map(([lat, lon]) => [lon, lat] as LonLat);
}

/** Lee el anillo guardado en la base (Json) y lo valida mínimamente. */
export function ringFromJson(value: unknown): LonLat[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2 && p.every((n) => typeof n === "number"))
    .map(([lon, lat]) => [lon, lat] as LonLat);
}
