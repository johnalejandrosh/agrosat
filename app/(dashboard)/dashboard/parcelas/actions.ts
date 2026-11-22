"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import type { ActionResult } from "@/lib/actions";
import { areaHa, centroid } from "@/lib/agro/geo";
import { recomputeAlerts } from "@/lib/alerts/engine";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { processParcel } from "@/lib/landsat/process";
import { authorize } from "@/lib/server/dal";
import { db } from "@/lib/server/db";
import { parcelAccess } from "@/lib/server/parcel-queries";
import { isNotFound } from "@/lib/server/prisma-errors";
import { fieldErrorsOf } from "@/lib/validation/admin";
import { newCropSchema, parcelSchema } from "@/lib/validation/agro";
import { NUEVO_CULTIVO, UMBRALES_GENERICOS } from "@/lib/agro/crops";

export type ParcelField = "name" | "cropId" | "newCropName" | "newCropDays" | "municipality" | "vereda" | "sownAt" | "boundary";

export type SaveParcelResult = ActionResult<ParcelField> & { parcelId?: string };

/** Procesa la parcela después de responder: la descarga de imágenes puede tardar unos minutos. */
function processInBackground(parcelId: string, trigger: "REGISTRATION" | "MANUAL", full = false) {
  after(async () => {
    await processParcel(db, parcelId, { trigger, full }).catch((error) => console.error("[AgroSat] Procesamiento:", error));
  });
}

/** Registra (RF-02) o edita una parcela. Si cambia el límite, se reprocesa todo el histórico. */
/** Usa el cultivo con ese nombre si ya existe (sin importar mayúsculas); si no, lo crea con umbrales genéricos. */
async function cultivoPorNombre(nombre: string, cycleDays: number): Promise<string> {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  const existente = await db.crop.findFirst({ where: { name: { equals: limpio, mode: "insensitive" } }, select: { id: true } });
  if (existente) return existente.id;
  const name = limpio.charAt(0).toLocaleUpperCase("es") + limpio.slice(1);
  try {
    const creado = await db.crop.create({ data: { name, cycleDays, ...UMBRALES_GENERICOS }, select: { id: true } });
    return creado.id;
  } catch {
    // Otro usuario lo creó al mismo tiempo.
    const otro = await db.crop.findFirstOrThrow({ where: { name: { equals: limpio, mode: "insensitive" } }, select: { id: true } });
    return otro.id;
  }
}

export async function saveParcelAction(_previous: SaveParcelResult, formData: FormData): Promise<SaveParcelResult> {
  const id = String(formData.get("id") ?? "") || null;
  const auth = await authorize(id ? undefined : PERMISSIONS.PARCELS_CREATE);
  if (!auth.ok) return { ok: false, message: auth.message };

  const parsed = parcelSchema.safeParse({
    name: formData.get("name") ?? "",
    cropId: formData.get("cropId") ?? "",
    municipality: formData.get("municipality") ?? "",
    vereda: formData.get("vereda") ?? "",
    sownAt: formData.get("sownAt") ?? "",
    boundary: formData.get("boundary") ?? "",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  const data = parsed.data;

  if (data.cropId === NUEVO_CULTIVO) {
    const nuevo = newCropSchema.safeParse({ newCropName: formData.get("newCropName") ?? "", newCropDays: formData.get("newCropDays") ?? "" });
    if (!nuevo.success) return { ok: false, fieldErrors: fieldErrorsOf(nuevo.error) };
    data.cropId = await cultivoPorNombre(nuevo.data.newCropName, nuevo.data.newCropDays);
  } else {
    const crop = await db.crop.findUnique({ where: { id: data.cropId }, select: { active: true } });
    if (!crop) return { ok: false, fieldErrors: { cropId: "Ese cultivo ya no existe." } };
  }

  const [lon, lat] = centroid(data.boundary);
  const geometry = { boundary: data.boundary, areaHa: Math.round(areaHa(data.boundary) * 1000) / 1000, centroidLat: lat, centroidLon: lon };
  const fields = { name: data.name, cropId: data.cropId, municipality: data.municipality, vereda: data.vereda, sownAt: data.sownAt };

  if (id) {
    const current = await db.parcel.findUnique({ where: { id }, select: { ownerId: true, boundary: true, cropId: true, sownAt: true } });
    if (!current) return { ok: false, message: "La parcela ya no existe." };
    if (!parcelAccess(auth.user, current.ownerId).canEdit) return { ok: false, message: "No puede editar esta parcela." };

    const boundaryChanged = JSON.stringify(current.boundary) !== JSON.stringify(data.boundary);
    try {
      await db.parcel.update({
        where: { id },
        data: { ...fields, ...(boundaryChanged ? { ...geometry, status: "PENDING", statusMessage: "En cola para procesar el nuevo límite…" } : {}) },
      });
    } catch (error) {
      if (isNotFound(error)) return { ok: false, message: "La parcela ya no existe." };
      throw error;
    }
    if (boundaryChanged) {
      processInBackground(id, "REGISTRATION", true);
    } else if (current.cropId !== data.cropId || current.sownAt.getTime() !== data.sownAt.getTime()) {
      // Otro cultivo u otra siembra cambian la etapa y los umbrales: se recalculan las alertas (sin correos del pasado).
      await recomputeAlerts(db, id, { notify: false });
    }
    refresh();
    return {
      ok: true,
      parcelId: id,
      message: boundaryChanged ? "Parcela actualizada. Se están reprocesando las imágenes con el nuevo límite." : "Parcela actualizada.",
    };
  }

  const parcel = await db.parcel.create({
    data: { ...fields, ...geometry, ownerId: auth.user.id, statusMessage: "En cola para buscar imágenes Landsat…" },
    select: { id: true },
  });
  processInBackground(parcel.id, "REGISTRATION");
  refresh();
  return { ok: true, parcelId: parcel.id, message: "Parcela registrada. Estamos buscando sus imágenes Landsat desde 2021." };
}

export async function deleteParcelAction(id: string): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, message: auth.message };
  const parcel = await db.parcel.findUnique({ where: { id }, select: { name: true, ownerId: true } });
  if (!parcel) return { ok: false, message: "La parcela ya no existe." };
  if (!parcelAccess(auth.user, parcel.ownerId).canDelete) return { ok: false, message: "No puede eliminar esta parcela." };
  // Observaciones, alertas y bitácora se eliminan en cascada.
  await db.parcel.delete({ where: { id } });
  refresh();
  return { ok: true, message: `Se eliminó la parcela ${parcel.name}.` };
}

/** Busca imágenes nuevas (o reprocesa todo el histórico) de una parcela. */
export async function reprocessParcelAction(id: string, full = false): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, message: auth.message };
  const parcel = await db.parcel.findUnique({ where: { id }, select: { ownerId: true, status: true, processingSince: true } });
  if (!parcel) return { ok: false, message: "La parcela ya no existe." };
  if (!parcelAccess(auth.user, parcel.ownerId).canReprocess) return { ok: false, message: "No tiene permiso para procesar esta parcela." };
  if (parcel.status === "PROCESSING" && parcel.processingSince && Date.now() - parcel.processingSince.getTime() < 45 * 60_000) {
    return { ok: false, message: "La parcela ya se está procesando. Espere a que termine." };
  }
  await db.parcel.update({
    where: { id },
    data: { status: "PENDING", statusMessage: full ? "En cola para reprocesar todo el histórico…" : "En cola para buscar imágenes nuevas…" },
  });
  processInBackground(id, "MANUAL", full);
  refresh();
  return { ok: true, message: full ? "Se reprocesará todo el histórico de la parcela." : "Buscando imágenes nuevas de la parcela." };
}

/** Estado de procesamiento, para que la vista lo consulte mientras trabaja. */
export async function parcelStatusAction(id: string) {
  const auth = await authorize();
  if (!auth.ok) return null;
  const parcel = await db.parcel.findUnique({ where: { id }, select: { ownerId: true, status: true, statusMessage: true } });
  if (!parcel || !parcelAccess(auth.user, parcel.ownerId).canView) return null;
  return { status: parcel.status, statusMessage: parcel.statusMessage };
}
