/**
 * Escalas de color de los índices (RF-06) y colores del semáforo.
 * NDVI: suelo café → verde intenso. NDWI: seco café → agua azul.
 */
import type { Indice, Nivel } from "./status";

type Rampa = { min: number; max: number; stops: [number, string][]; textoBajo: string; textoAlto: string };

export const RAMPA: Record<Indice, Rampa> = {
  NDVI: {
    min: 0,
    max: 0.9,
    stops: [
      [0, "#a6611a"],
      [0.25, "#dfc27d"],
      [0.45, "#d9ef8b"],
      [0.6, "#91cf60"],
      [0.75, "#1a9850"],
      [0.9, "#0b5d1e"],
    ],
    textoBajo: "menos vigor",
    textoAlto: "más vigor",
  },
  NDWI: {
    min: -0.2,
    max: 0.4,
    stops: [
      [-0.2, "#a6611a"],
      [-0.05, "#e6d3a3"],
      [0.1, "#c6dbef"],
      [0.2, "#6baed6"],
      [0.3, "#2171b5"],
      [0.4, "#08306b"],
    ],
    textoBajo: "menos agua",
    textoAlto: "más agua",
  },
};

/** Gris de los píxeles descartados por nubes (QA_PIXEL). */
export const COLOR_NUBE = "#c3c7cc";

/** Semáforo con contraste suficiente sobre fondo claro y oscuro. */
export const NIVEL_COLOR: Record<Nivel, string> = { verde: "#2e7d32", amarillo: "#e0a100", rojo: "#c62828" };

function mezclar(c1: string, c2: string, f: number): string {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1);
  const b = p(c2);
  return `#${a.map((x, i) => Math.round(x + (b[i] - x) * f).toString(16).padStart(2, "0")).join("")}`;
}

export function colorRampa(indice: Indice, valor: number): string {
  const r = RAMPA[indice];
  const s = r.stops;
  const v = Math.max(r.min, Math.min(r.max, valor));
  for (let k = 1; k < s.length; k++) {
    if (v <= s[k][0]) return mezclar(s[k - 1][1], s[k][1], (v - s[k - 1][0]) / (s[k][0] - s[k - 1][0]));
  }
  return s[s.length - 1][1];
}

/** `linear-gradient` CSS de la leyenda. */
export function gradienteRampa(indice: Indice): string {
  const r = RAMPA[indice];
  return `linear-gradient(90deg, ${r.stops.map(([v, c]) => `${c} ${Math.round(((v - r.min) / (r.max - r.min)) * 100)}%`).join(", ")})`;
}
