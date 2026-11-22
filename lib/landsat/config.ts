/**
 * Parámetros del módulo de procesamiento Landsat. Todos tienen un valor por defecto
 * razonable; se pueden ajustar con variables de entorno (ver .env.example).
 */

const number = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) ? n : fallback;
};

export const LANDSAT = {
  /** Catálogo STAC con Landsat Colección 2 Nivel 2 (Microsoft Planetary Computer, acceso gratuito). */
  stacUrl: process.env.LANDSAT_STAC_URL?.trim() || "https://planetarycomputer.microsoft.com/api/stac/v1",
  collection: process.env.LANDSAT_COLLECTION?.trim() || "landsat-c2-l2",
  /** Servicio que firma las URLs de los archivos (tokens SAS de Planetary Computer). Vacío = no firmar. */
  signUrl:
    process.env.LANDSAT_SIGN_URL !== undefined
      ? process.env.LANDSAT_SIGN_URL.trim()
      : "https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2",
  platforms: ["landsat-8", "landsat-9"],
  /** Análisis histórico desde 2021 (delimitación temporal del proyecto). */
  historyFrom: process.env.LANDSAT_HISTORY_FROM?.trim() || "2021-01-01",
  /** % máximo de píxeles de la parcela cubiertos por nubes para que la fecha sea válida. */
  maxParcelCloud: number(process.env.LANDSAT_MAX_PARCEL_CLOUD, 50),
  /** Escenas con más nubosidad total que esto ni se descargan (casi nunca dejan ver la parcela). */
  maxSceneCloud: number(process.env.LANDSAT_MAX_SCENE_CLOUD, 90),
  /** Escenas que se procesan en paralelo. */
  concurrency: Math.max(1, Math.min(12, number(process.env.LANDSAT_CONCURRENCY, 4))),
  /** Bandas de reflectancia superficial (asset del ítem STAC) usadas por AgroSat. */
  bands: { red: "red", nir: "nir08", swir: "swir16", qa: "qa_pixel" },
  /** Factores de escala de la Colección 2 Nivel 2: ρ = DN × 0,0000275 − 0,2. */
  scale: 2.75e-5,
  offset: -0.2,
  /** Un procesamiento que lleve más de esto se considera abandonado y se puede relanzar. */
  staleMinutes: 45,
} as const;

/**
 * Bits de QA_PIXEL (Colección 2) que descartan un píxel:
 * 1 nube dilatada, 2 cirro, 3 nube, 4 sombra de nube, 5 nieve. El bit 0 marca "sin dato".
 */
export const QA_FILL = 1 << 0;
export const QA_MASK = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
