import { cacheLife } from "next/cache";

export type Tle = { id: "landsat-8" | "landsat-9"; name: string; norad: number; line1: string; line2: string };

/** Elementos orbitales de respaldo (CelesTrak, 18-nov-2026) por si no hay conexión. */
const RESPALDO: Tle[] = [
  {
    id: "landsat-8",
    name: "Landsat 8",
    norad: 39084,
    line1: "1 39084U 13008A   26322.60052347  .00000290  00000+0  74524-4 0  9994",
    line2: "2 39084  98.2145  30.7596 0001202  90.8814 269.2522 14.57114881720388",
  },
  {
    id: "landsat-9",
    name: "Landsat 9",
    norad: 49260,
    line1: "1 49260U 21088A   26322.15414161  .00000278  00000+0  71694-4 0  9995",
    line2: "2 49260  98.2124  30.3276 0001007  90.6543 269.4771 14.57115534273425",
  },
];

async function descargar(sat: Tle): Promise<Tle> {
  try {
    const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.norad}&FORMAT=TLE`, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "AgroSat/1.0" },
    });
    if (!res.ok) return sat;
    const lines = (await res.text()).split(/\r?\n/).map((l) => l.trim());
    const line1 = lines.find((l) => l.startsWith("1 "));
    const line2 = lines.find((l) => l.startsWith("2 "));
    return line1 && line2 ? { ...sat, line1, line2 } : sat;
  } catch {
    return sat;
  }
}

/** TLE actuales de Landsat 8 y 9; se refrescan cada pocas horas (CelesTrak publica ~3 veces al día). */
export async function getLandsatTle(): Promise<{ tle: Tle[]; fetchedAt: string }> {
  "use cache";
  cacheLife("hours");
  const tle = await Promise.all(RESPALDO.map(descargar));
  return { tle, fetchedAt: new Date().toISOString() };
}
