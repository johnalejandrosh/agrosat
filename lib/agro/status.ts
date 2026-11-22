/**
 * Semáforo, etapas del cultivo y alertas tempranas (RF-08, RF-09, RF-10).
 * Lógica pura compartida por el servidor (generación de alertas) y el navegador
 * (vista previa de umbrales, colores de la gráfica).
 */
import { DAY_MS, num } from "./format";

export type Nivel = "verde" | "amarillo" | "rojo";
export type Indice = "NDVI" | "NDWI";

export const NIVEL_ORDEN: Record<Nivel, number> = { verde: 0, amarillo: 1, rojo: 2 };
export const NIVEL_TXT: Record<Nivel, string> = { verde: "Normal", amarillo: "Precaución", rojo: "Alerta" };

export type Umbrales = {
  ndviWarning: number;
  ndviAlert: number;
  ndwiWarning: number;
  ndwiAlert: number;
};

export type CicloCultivo = { cycleDays: number };

// ------------------------------------------------------------------ Etapas

export type Etapa = "sin-siembra" | "establecimiento" | "desarrollo" | "cosecha" | "sin-cultivo";

export const ETAPA_TXT: Record<Etapa, string> = {
  "sin-siembra": "Antes de la siembra",
  establecimiento: "Establecimiento",
  desarrollo: "Desarrollo",
  cosecha: "Cerca de cosecha",
  "sin-cultivo": "Ciclo terminado",
};

/** Fracción del ciclo en la fecha `at` (0 = siembra, 1 = cosecha esperada). */
export function fraccionCiclo(sownAt: Date, cycleDays: number, at: Date): number {
  return (at.getTime() - sownAt.getTime()) / DAY_MS / cycleDays;
}

export function etapaEn(sownAt: Date, cycleDays: number, at: Date): Etapa {
  const t = fraccionCiclo(sownAt, cycleDays, at);
  if (t < 0) return "sin-siembra";
  if (t < 0.3) return "establecimiento";
  if (t < 0.8) return "desarrollo";
  if (t <= 1) return "cosecha";
  return "sin-cultivo";
}

/** Día del ciclo (1 = día de siembra). */
export function diaCiclo(sownAt: Date, at: Date): number {
  return Math.floor((at.getTime() - sownAt.getTime()) / DAY_MS) + 1;
}

// ------------------------------------------------------------------ Clasificación

export type Motivo = { nivel: Exclude<Nivel, "verde">; indice: Indice; valor: number; umbral: number };
export type Clasificacion = { nivel: Nivel; motivos: Motivo[] };

export type ObsMinima = { valid: boolean; ndvi: number | null; ndwi: number | null; acquiredAt: Date };

const NORMAL: Clasificacion = { nivel: "verde", motivos: [] };

/**
 * Clasifica una observación. Solo se evalúa en la etapa de desarrollo: al establecerse
 * el cultivo o cerca de la cosecha el verdor es bajo por naturaleza y daría falsas alarmas.
 */
export function clasificar(o: ObsMinima | null, u: Umbrales, etapa: Etapa): Clasificacion {
  if (!o || !o.valid || o.ndvi === null || o.ndwi === null || etapa !== "desarrollo") return NORMAL;
  const rojo: Motivo[] = [];
  if (o.ndwi < u.ndwiAlert) rojo.push({ nivel: "rojo", indice: "NDWI", valor: o.ndwi, umbral: u.ndwiAlert });
  if (o.ndvi < u.ndviAlert) rojo.push({ nivel: "rojo", indice: "NDVI", valor: o.ndvi, umbral: u.ndviAlert });
  if (rojo.length) return { nivel: "rojo", motivos: rojo };
  const amarillo: Motivo[] = [];
  if (o.ndwi < u.ndwiWarning) amarillo.push({ nivel: "amarillo", indice: "NDWI", valor: o.ndwi, umbral: u.ndwiWarning });
  if (o.ndvi < u.ndviWarning) amarillo.push({ nivel: "amarillo", indice: "NDVI", valor: o.ndvi, umbral: u.ndviWarning });
  return amarillo.length ? { nivel: "amarillo", motivos: amarillo } : NORMAL;
}

/** Nivel de un índice concreto (para las tarjetas de NDVI / NDWI del detalle). */
export function nivelIndice(o: ObsMinima | null, u: Umbrales, etapa: Etapa, indice: Indice): Nivel {
  if (!o || !o.valid || etapa !== "desarrollo") return "verde";
  const v = indice === "NDVI" ? o.ndvi : o.ndwi;
  if (v === null) return "verde";
  const [aviso, alerta] = indice === "NDVI" ? [u.ndviWarning, u.ndviAlert] : [u.ndwiWarning, u.ndwiAlert];
  return v < alerta ? "rojo" : v < aviso ? "amarillo" : "verde";
}

// ------------------------------------------------------------------ Textos

const TITULO: Record<`${Indice}-${Exclude<Nivel, "verde">}`, string> = {
  "NDWI-rojo": "Posible estrés hídrico",
  "NDWI-amarillo": "Baja el agua del cultivo",
  "NDVI-rojo": "Pérdida fuerte de vigor",
  "NDVI-amarillo": "Baja el vigor del cultivo",
};

export function tituloAlerta(indice: Indice, nivel: Exclude<Nivel, "verde">): string {
  return TITULO[`${indice}-${nivel}`];
}

/** Mensaje en lenguaje sencillo para el productor (RNF-01). */
export function mensajeAlerta(m: Pick<Motivo, "indice" | "nivel" | "valor" | "umbral">): string {
  const v = num(m.valor);
  const u = num(m.umbral);
  if (m.indice === "NDWI") {
    return m.nivel === "rojo"
      ? `El agua en las hojas del cultivo (NDWI ${v}) está por debajo del nivel de alerta (${u}). Revise el riego lo antes posible.`
      : `El agua en las hojas del cultivo (NDWI ${v}) bajó del nivel de precaución (${u}). Esté atento al riego en los próximos días.`;
  }
  return m.nivel === "rojo"
    ? `El verdor del cultivo (NDVI ${v}) está por debajo del nivel de alerta (${u}). Se recomienda visitar el lote.`
    : `El verdor del cultivo (NDVI ${v}) bajó del nivel de precaución (${u}). Revise el lote en los próximos días.`;
}

/** Frase corta del estado de la parcela para listas y tarjetas. */
export function resumenEstado(c: Clasificacion, etapaUltima: Etapa | null, hayDatos: boolean): string {
  if (!hayDatos || !etapaUltima) return "Sin imágenes válidas todavía";
  if (c.nivel !== "verde") return tituloAlerta(c.motivos[0].indice, c.motivos[0].nivel);
  switch (etapaUltima) {
    case "establecimiento":
      return "Normal para un cultivo recién sembrado";
    case "cosecha":
      return "Normal: el cultivo está cerca de la cosecha";
    case "sin-siembra":
    case "sin-cultivo":
      return "Sin cultivo en desarrollo";
    default:
      return "El cultivo se ve sano";
  }
}

// ------------------------------------------------------------------ Alertas

export type AlertaDerivada = {
  observationId: string;
  nivel: Exclude<Nivel, "verde">;
  indice: Indice;
  valor: number;
  umbral: number;
  openedAt: Date;
  status: "ACTIVE" | "CLOSED";
  closedAt: Date | null;
};

/**
 * Recorre las fechas válidas en orden y abre una alerta cada vez que el semáforo empeora
 * (verde → amarillo, amarillo → rojo…); la alerta abierta se cierra cuando empeora de nuevo
 * (la reemplaza otra) o cuando el cultivo vuelve a verde.
 */
export function derivarAlertas<T extends ObsMinima & { id: string }>(
  observaciones: T[],
  u: Umbrales,
  etapaDe: (o: T) => Etapa,
): AlertaDerivada[] {
  const ordenadas = [...observaciones].filter((o) => o.valid).sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());
  const out: AlertaDerivada[] = [];
  let anterior: Nivel = "verde";
  let abierta: AlertaDerivada | null = null;
  for (const o of ordenadas) {
    const c = clasificar(o, u, etapaDe(o));
    if (NIVEL_ORDEN[c.nivel] > NIVEL_ORDEN[anterior]) {
      if (abierta) {
        abierta.status = "CLOSED";
        abierta.closedAt = o.acquiredAt;
      }
      const m = c.motivos[0];
      abierta = {
        observationId: o.id,
        nivel: m.nivel,
        indice: m.indice,
        valor: m.valor,
        umbral: m.umbral,
        openedAt: o.acquiredAt,
        status: "ACTIVE",
        closedAt: null,
      };
      out.push(abierta);
    } else if (c.nivel === "verde" && abierta) {
      abierta.status = "CLOSED";
      abierta.closedAt = o.acquiredAt;
      abierta = null;
    }
    anterior = c.nivel;
  }
  return out;
}

/** Validación de umbrales (RF-12): rango [-1, 1] y alerta < precaución. */
export function erroresUmbrales(u: Umbrales): string[] {
  const valores = [u.ndviWarning, u.ndviAlert, u.ndwiWarning, u.ndwiAlert];
  if (valores.some((v) => !Number.isFinite(v) || v < -1 || v > 1)) return ["Use valores entre -1 y 1."];
  const e: string[] = [];
  if (!(u.ndviAlert < u.ndviWarning)) e.push("NDVI: el nivel de alerta debe ser menor que el de precaución.");
  if (!(u.ndwiAlert < u.ndwiWarning)) e.push("NDWI: el nivel de alerta debe ser menor que el de precaución.");
  return e;
}

// ------------------------------------------------------------------ Calendario Landsat

/** Landsat 8 y 9 pasan por el mismo punto cada 16 días, desfasados 8 días entre sí. */
export const REVISITA_DIAS = 8;

export function proximaPasada(ultima: { acquiredAt: Date; platform: string } | null, hoy = new Date()) {
  if (!ultima) return null;
  let ts = ultima.acquiredAt.getTime();
  let sat = ultima.platform;
  do {
    ts += REVISITA_DIAS * DAY_MS;
    sat = sat === "landsat-8" ? "landsat-9" : "landsat-8";
  } while (ts < hoy.getTime() - DAY_MS / 2);
  return { acquiredAt: new Date(ts), platform: sat };
}
