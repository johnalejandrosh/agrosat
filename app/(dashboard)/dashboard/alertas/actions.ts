"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/actions";
import { authorize } from "@/lib/server/dal";
import { db } from "@/lib/server/db";

/** Activa o desactiva el aviso por correo de las alertas propias. */
export async function setEmailAlertsAction(enabled: boolean): Promise<ActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, message: auth.message };
  await db.user.update({ where: { id: auth.user.id }, data: { emailAlerts: enabled } });
  refresh();
  return { ok: true, message: enabled ? "Recibirá las alertas por correo electrónico." : "Ya no recibirá alertas por correo." };
}
