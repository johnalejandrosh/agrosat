import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";

export type Posicion = { lon: number; lat: number; alt: number; vel: number };
export type Pasada = { at: Date; distKm: number };

/** Media del barrido del sensor OLI/TIRS de Landsat (185 km de ancho). */
export const MEDIO_BARRIDO_KM = 92.5;
const R_TIERRA = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export const satrecDe = (line1: string, line2: string) => twoline2satrec(line1, line2);

/** Punto bajo el satélite (subsatelital), altitud en km y velocidad en km/s. */
export function posicion(sat: SatRec, fecha: Date): Posicion | null {
  const pv = propagate(sat, fecha);
  if (!pv || typeof pv.position !== "object" || typeof pv.velocity !== "object") return null;
  const g = eciToGeodetic(pv.position, gstime(fecha));
  const { x, y, z } = pv.velocity;
  return { lon: degreesLong(g.longitude), lat: degreesLat(g.latitude), alt: g.height, vel: Math.hypot(x, y, z) };
}

/** Distancia por la superficie (haversine) en km. */
export function distanciaKm(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.min(1, Math.sqrt(h)));
}

function rumbo(a: Posicion, b: Posicion) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return Math.atan2(y, x);
}

function desplazar(p: { lon: number; lat: number }, rumboRad: number, km: number): [number, number] {
  const d = km / R_TIERRA;
  const lat1 = rad(p.lat);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(rumboRad));
  const lon2 = rad(p.lon) + Math.atan2(Math.sin(rumboRad) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [deg(lon2), deg(lat2)];
}

/** Longitudes continuas (sin saltos de ±360°) para que las líneas crucen bien el antimeridiano. */
function desenrollar(coords: [number, number][]) {
  for (let i = 1; i < coords.length; i++) {
    while (coords[i][0] - coords[i - 1][0] > 180) coords[i][0] -= 360;
    while (coords[i][0] - coords[i - 1][0] < -180) coords[i][0] += 360;
  }
  return coords;
}

/** Traza en tierra entre `desde` y `hasta` (ms), muestreada cada `pasoS` segundos. */
export function traza(sat: SatRec, desde: number, hasta: number, pasoS = 30): Posicion[] {
  const out: Posicion[] = [];
  for (let t = desde; t <= hasta; t += pasoS * 1000) {
    const p = posicion(sat, new Date(t));
    if (p) out.push(p);
  }
  return out;
}

export const linea = (puntos: Posicion[]) => desenrollar(puntos.map((p) => [p.lon, p.lat] as [number, number]));

/** Franja de 185 km que el sensor observa a lo largo de la traza. */
export function franja(puntos: Posicion[]): [number, number][] {
  if (puntos.length < 2) return [];
  const izq: [number, number][] = [];
  const der: [number, number][] = [];
  puntos.forEach((p, i) => {
    const r = i === 0 ? rumbo(puntos[0], puntos[1]) : rumbo(puntos[i - 1], p);
    izq.push(desplazar(p, r - Math.PI / 2, MEDIO_BARRIDO_KM));
    der.push(desplazar(p, r + Math.PI / 2, MEDIO_BARRIDO_KM));
  });
  const anillo = desenrollar([...izq, ...der.reverse()]);
  return [...anillo, anillo[0]];
}

/**
 * Próximas pasadas diurnas (descendentes, ~10:00 hora local) en que el punto queda dentro del
 * barrido del sensor. Busca hasta `dias` días hacia adelante.
 */
export function proximasPasadas(sat: SatRec, punto: { lon: number; lat: number }, desde: number, dias = 33, max = 2): Pasada[] {
  const paso = 20_000;
  const out: Pasada[] = [];
  let prev: { d: number; p: Posicion } | null = null;
  let bajando = false;
  for (let t = desde; t < desde + dias * 86_400_000 && out.length < max; t += paso) {
    const p = posicion(sat, new Date(t));
    if (!p) continue;
    const d = distanciaKm(p, punto);
    if (prev) {
      if (d > prev.d && bajando && prev.d <= MEDIO_BARRIDO_KM + 5 && p.lat < prev.p.lat) {
        out.push({ at: new Date(t - paso), distKm: prev.d });
      }
      bajando = d < prev.d;
    }
    // Lejos del punto se puede avanzar más rápido.
    if (d > 8000) t += 240_000;
    else if (d > 3000) t += 60_000;
    prev = { d, p };
  }
  return out;
}
