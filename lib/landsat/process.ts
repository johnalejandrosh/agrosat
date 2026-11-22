/**
 * Orquestación del procesamiento (RF-03 a RF-05): busca las escenas nuevas de cada parcela,
 * calcula NDVI y NDWI, guarda las observaciones y recalcula las alertas.
 *
 * No depende de Next.js: lo usan las Server Actions (vía `after`), la ruta /api/cron/landsat
 * y el script `npm run landsat:sync`. Recibe el cliente de Prisma como parámetro.
 */
import type { PrismaClient, RunTrigger } from "@/generated/prisma/client";
import { parseDay } from "@/lib/agro/format";
import { ringFromJson } from "@/lib/agro/geo";
import { recomputeAlerts } from "@/lib/alerts/engine";
import { LANDSAT } from "./config";
import { RasterCache, observeParcel } from "./raster";
import { LandsatError, searchScenes, type SceneInfo } from "./stac";

export type ProcessOptions = {
  trigger: RunTrigger;
  /** Reprocesar todo el histórico, no solo las fechas que faltan. */
  full?: boolean;
  /** Compartida entre parcelas de una misma sincronización. */
  cache?: RasterCache;
  log?: (message: string) => void;
};

export type ProcessResult = {
  parcelId: string;
  status: "SUCCESS" | "ERROR" | "BUSY";
  scenesFound: number;
  scenesProcessed: number;
  validCount: number;
  alertsOpened: number;
  message: string;
};

/** Ejecuta tareas con un máximo de `limit` en paralelo. */
async function pool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await worker(items[index], index);
      }
    }),
  );
}

/** Marca la parcela "en proceso" solo si nadie más la está procesando (o el proceso anterior quedó colgado). */
async function claim(db: PrismaClient, parcelId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LANDSAT.staleMinutes * 60_000);
  const { count } = await db.parcel.updateMany({
    where: { id: parcelId, OR: [{ status: { not: "PROCESSING" } }, { processingSince: null }, { processingSince: { lt: staleBefore } }] },
    data: { status: "PROCESSING", processingSince: new Date(), statusMessage: "Buscando imágenes Landsat…" },
  });
  return count === 1;
}

export async function processParcel(db: PrismaClient, parcelId: string, options: ProcessOptions): Promise<ProcessResult> {
  const log = options.log ?? (() => {});
  const empty = { parcelId, scenesFound: 0, scenesProcessed: 0, validCount: 0, alertsOpened: 0 };
  if (!(await claim(db, parcelId))) return { ...empty, status: "BUSY", message: "La parcela ya se está procesando." };

  const parcel = await db.parcel.findUniqueOrThrow({
    where: { id: parcelId },
    select: { id: true, name: true, boundary: true, observations: { select: { sceneId: true } } },
  });
  const ring = ringFromJson(parcel.boundary);
  const searchFrom = parseDay(LANDSAT.historyFrom);
  const searchTo = new Date();
  const run = await db.processingRun.create({
    data: { parcelId, trigger: options.trigger, searchFrom, searchTo },
    select: { id: true },
  });

  const cache = options.cache ?? new RasterCache();
  const counters = { found: 0, processed: 0, valid: 0 };

  try {
    if (options.full) {
      await db.observation.deleteMany({ where: { parcelId } });
    }
    const done = new Set(options.full ? [] : parcel.observations.map((o) => o.sceneId));

    const all = await searchScenes(ring, searchFrom, searchTo);
    const pending = all.filter((s) => !done.has(s.id) && (s.cloudCover === null || s.cloudCover <= LANDSAT.maxSceneCloud));
    counters.found = pending.length;
    log(`${parcel.name}: ${all.length} escenas en el catálogo, ${pending.length} por procesar`);

    const progress = async () => {
      await db.parcel.update({
        where: { id: parcelId },
        data: { statusMessage: `Procesando imágenes: ${counters.processed} de ${counters.found} · ${counters.valid} fechas válidas` },
      });
      await db.processingRun.update({
        where: { id: run.id },
        data: { scenesFound: counters.found, scenesProcessed: counters.processed, validCount: counters.valid },
      });
    };
    await progress();

    // De la más reciente a la más antigua: el estado actual aparece primero.
    await pool(pending, LANDSAT.concurrency, async (scene: SceneInfo) => {
      const obs = await observeScene(cache, scene, ring);
      if (obs) {
        await db.scene.upsert({
          where: { id: scene.id },
          update: {},
          create: {
            id: scene.id,
            platform: scene.platform,
            acquiredAt: scene.acquiredAt,
            wrsPath: scene.wrsPath,
            wrsRow: scene.wrsRow,
            cloudCover: scene.cloudCover,
            epsg: scene.epsg,
          },
        });
        await db.observation.upsert({
          where: { parcelId_sceneId: { parcelId, sceneId: scene.id } },
          update: {},
          create: {
            parcelId,
            sceneId: scene.id,
            acquiredAt: scene.acquiredAt,
            pixelCount: obs.pixelCount,
            clearCount: obs.clearCount,
            cloudPct: obs.cloudPct,
            valid: obs.valid,
            ndvi: obs.ndvi,
            ndwi: obs.ndwi,
            pixels: obs.pixels,
          },
        });
        if (obs.valid) counters.valid++;
      }
      counters.processed++;
      if (counters.processed % 5 === 0) await progress();
    });

    const alerts = await recomputeAlerts(db, parcelId);
    const message =
      counters.found === 0
        ? "No hay imágenes nuevas desde el último procesamiento."
        : `${counters.processed} imágenes procesadas, ${counters.valid} fechas válidas sin nubes.`;
    await db.processingRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        scenesFound: counters.found,
        scenesProcessed: counters.processed,
        validCount: counters.valid,
        alertsOpened: alerts.opened,
        message,
        finishedAt: new Date(),
      },
    });
    await db.parcel.update({
      where: { id: parcelId },
      data: { status: "READY", statusMessage: null, processingSince: null, processedAt: new Date() },
    });
    log(`${parcel.name}: ${message} Alertas nuevas: ${alerts.opened}`);
    return { parcelId, status: "SUCCESS", scenesFound: counters.found, scenesProcessed: counters.processed, validCount: counters.valid, alertsOpened: alerts.opened, message };
  } catch (error) {
    const message = error instanceof LandsatError ? error.message : `Error al procesar las imágenes: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[AgroSat] ${parcel.name}:`, error);
    // Lo ya calculado se conserva: el próximo intento sigue desde ahí.
    await recomputeAlerts(db, parcelId).catch(() => undefined);
    await db.processingRun.update({
      where: { id: run.id },
      data: { status: "ERROR", scenesFound: counters.found, scenesProcessed: counters.processed, validCount: counters.valid, message: message.slice(0, 1000), finishedAt: new Date() },
    });
    await db.parcel.update({
      where: { id: parcelId },
      data: { status: "ERROR", statusMessage: message.slice(0, 500), processingSince: null, processedAt: new Date() },
    });
    return { ...empty, scenesFound: counters.found, scenesProcessed: counters.processed, validCount: counters.valid, status: "ERROR", message };
  }
}

/** Una escena que falla (archivo dañado, corte de red) no detiene el resto: se reintenta en la próxima sincronización. */
async function observeScene(cache: RasterCache, scene: SceneInfo, ring: ReturnType<typeof ringFromJson>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await observeParcel(cache, scene, ring);
    } catch (error) {
      if (attempt === 2) {
        console.warn(`[AgroSat] Escena ${scene.id} omitida:`, error instanceof Error ? error.message : error);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  return null;
}

/**
 * Sincronización programada: procesa las imágenes nuevas de todas las parcelas (o de las indicadas).
 * Las parcelas cercanas comparten escena, así que se reutiliza la caché de archivos.
 */
export async function syncParcels(
  db: PrismaClient,
  { trigger = "SCHEDULED" as RunTrigger, parcelIds, full = false, log }: { trigger?: RunTrigger; parcelIds?: string[]; full?: boolean; log?: (m: string) => void } = {},
) {
  const parcels = await db.parcel.findMany({
    where: parcelIds ? { id: { in: parcelIds } } : {},
    orderBy: [{ centroidLat: "asc" }, { centroidLon: "asc" }],
    select: { id: true },
  });
  const cache = new RasterCache();
  const results: ProcessResult[] = [];
  for (const p of parcels) {
    results.push(await processParcel(db, p.id, { trigger, full, cache, log }));
  }
  cache.clear();
  return results;
}
