/**
 * Formatos de AgroSat (es-CO). Las fechas de imágenes y de siembra se manejan
 * como días calendario: se formatean en UTC para que servidor y navegador coincidan.
 */

export const DAY_MS = 86_400_000;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type DateInput = Date | string | number;

const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value));

/** "10 nov 2026". */
export function fecha(value: DateInput): string {
  const d = toDate(value);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "nov 26" (ejes de gráficas). */
export function mesAnio(value: DateInput): string {
  const d = toDate(value);
  return `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

/** "2026-11-10". */
export function isoDay(value: DateInput): string {
  return toDate(value).toISOString().slice(0, 10);
}

/** Fecha calendario (YYYY-MM-DD) a las 12:00 UTC, para comparar días sin saltos de zona horaria. */
export function parseDay(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

/** Número con coma decimal ("0,72"); "—" si no hay valor. */
export function num(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toFixed(decimals).replace(".", ",");
}

/** "0,64 ha" o "1,9 ha". */
export function hectareas(value: number): string {
  return `${num(value, value < 1 ? 2 : 1)} ha`;
}

/** Días completos entre dos fechas (b − a). */
export function daysBetween(a: DateInput, b: DateInput): number {
  return (toDate(b).getTime() - toDate(a).getTime()) / DAY_MS;
}

/** "Landsat 9" a partir de "landsat-9". */
export function satelite(platform: string): string {
  return platform.replace(/^landsat-/i, "Landsat ");
}
