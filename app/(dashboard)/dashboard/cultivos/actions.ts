"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions";
import { recomputeAlerts } from "@/lib/alerts/engine";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { authorize } from "@/lib/server/dal";
import { db } from "@/lib/server/db";
import { isNotFound, isUniqueViolation } from "@/lib/server/prisma-errors";
import { fieldErrorsOf } from "@/lib/validation/admin";
import { cropSchema } from "@/lib/validation/agro";

export type CropField = "name" | "cycleDays" | "ndviWarning" | "ndviAlert" | "ndwiWarning" | "ndwiAlert" | "active";

/** Crea un cultivo o ajusta su ciclo y umbrales (RF-12). Las alertas de sus parcelas se recalculan sin enviar correos. */
export async function saveCropAction(_previous: ActionResult<CropField>, formData: FormData): Promise<ActionResult<CropField>> {
  const auth = await authorize(PERMISSIONS.CROPS_UPDATE);
  if (!auth.ok) return { ok: false, message: auth.message };

  const id = String(formData.get("id") ?? "") || null;
  const parsed = cropSchema.safeParse({
    name: formData.get("name") ?? "",
    cycleDays: formData.get("cycleDays") ?? "",
    ndviWarning: formData.get("ndviWarning") ?? "",
    ndviAlert: formData.get("ndviAlert") ?? "",
    ndwiWarning: formData.get("ndwiWarning") ?? "",
    ndwiAlert: formData.get("ndwiAlert") ?? "",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    const crop = id
      ? await db.crop.update({ where: { id }, data: parsed.data, select: { id: true, name: true } })
      : await db.crop.create({ data: parsed.data, select: { id: true, name: true } });

    const parcels = await db.parcel.findMany({ where: { cropId: crop.id }, select: { id: true } });
    for (const p of parcels) await recomputeAlerts(db, p.id, { notify: false });

    refresh();
    return {
      ok: true,
      message: id
        ? `Se guardaron los umbrales de ${crop.name}${parcels.length ? ` y se recalcularon las alertas de ${parcels.length} ${parcels.length === 1 ? "parcela" : "parcelas"}` : ""}.`
        : `Se creó el cultivo ${crop.name}.`,
    };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, fieldErrors: { name: "Ya existe un cultivo con ese nombre." } };
    if (isNotFound(error)) return { ok: false, message: "El cultivo ya no existe." };
    throw error;
  }
}
