"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import type { ActionResult } from "@/lib/actions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { syncParcels } from "@/lib/landsat/process";
import { authorize } from "@/lib/server/dal";
import { db } from "@/lib/server/db";

/** Busca imágenes nuevas para todas las parcelas (lo mismo que hace la tarea programada). */
export async function syncAllAction(): Promise<ActionResult> {
  const auth = await authorize(PERMISSIONS.LANDSAT_PROCESS);
  if (!auth.ok) return { ok: false, message: auth.message };
  const busy = await db.parcel.count({ where: { status: "PROCESSING", processingSince: { gt: new Date(Date.now() - 45 * 60_000) } } });
  if (busy > 0) return { ok: false, message: `Hay ${busy} ${busy === 1 ? "parcela" : "parcelas"} en proceso. Espere a que terminen.` };

  const total = await db.parcel.count();
  after(async () => {
    await syncParcels(db, { trigger: "MANUAL" }).catch((error) => console.error("[AgroSat] Sincronización:", error));
  });
  refresh();
  return { ok: true, message: `Sincronización iniciada para ${total} ${total === 1 ? "parcela" : "parcelas"}. Puede tardar varios minutos.` };
}
