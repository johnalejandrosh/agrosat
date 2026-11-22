/**
 * Cultivos iniciales de Sabana Centro (hortalizas y papa) con umbrales sugeridos.
 * Son el punto de partida: el administrador los ajusta desde "Cultivos y umbrales" (RF-12).
 */
export const DEFAULT_CROPS = [
  { name: "Papa pastusa", cycleDays: 165, ndviWarning: 0.6, ndviAlert: 0.45, ndwiWarning: 0.15, ndwiAlert: 0.05 },
  { name: "Papa criolla", cycleDays: 120, ndviWarning: 0.6, ndviAlert: 0.45, ndwiWarning: 0.15, ndwiAlert: 0.05 },
  { name: "Lechuga", cycleDays: 80, ndviWarning: 0.55, ndviAlert: 0.4, ndwiWarning: 0.12, ndwiAlert: 0.03 },
  { name: "Zanahoria", cycleDays: 120, ndviWarning: 0.55, ndviAlert: 0.4, ndwiWarning: 0.12, ndwiAlert: 0.03 },
  { name: "Brócoli", cycleDays: 95, ndviWarning: 0.58, ndviAlert: 0.42, ndwiWarning: 0.12, ndwiAlert: 0.03 },
  { name: "Arveja", cycleDays: 130, ndviWarning: 0.58, ndviAlert: 0.42, ndwiWarning: 0.13, ndwiAlert: 0.04 },
] as const;

/** Valor del selector de cultivo para registrar uno que todavía no está en la lista. */
export const NUEVO_CULTIVO = "__nuevo__";

/**
 * Umbrales de partida para un cultivo que registra el propio productor. Son los valores típicos de
 * hortalizas; el administrador puede ajustarlos después en "Cultivos y umbrales".
 */
export const UMBRALES_GENERICOS = { ndviWarning: 0.55, ndviAlert: 0.4, ndwiWarning: 0.12, ndwiAlert: 0.03 } as const;

/** Municipios de la delimitación espacial (predios piloto) con su centro para el mapa. Son sugerencias: se acepta cualquier lugar. */
export const MUNICIPIOS: Record<string, [lat: number, lon: number]> = {
  Chía: [4.879, -74.0888],
  Cajicá: [4.9462, -74.0472],
  Cogua: [5.0535, -73.9978],
  Zipaquirá: [5.0221, -74.0048],
  Tabio: [4.9168, -74.0977],
  Tenjo: [4.8722, -74.1444],
  Sopó: [4.9077, -73.9381],
  Tocancipá: [4.9653, -73.9135],
  Gachancipá: [4.9913, -73.8726],
  Cota: [4.8094, -74.1032],
  Nemocón: [5.0678, -73.8783],
};

export const MUNICIPIOS_PILOTO = ["Chía", "Cajicá", "Cogua"];
