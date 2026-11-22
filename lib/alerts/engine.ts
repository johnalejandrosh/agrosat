/**
 * Motor de alertas: a partir de las observaciones de una parcela y los umbrales de su
 * cultivo, deja en la base exactamente las alertas que corresponden (RF-08, RF-09, RF-10).
 *
 * Es determinista e idempotente: se puede ejecutar tras cada procesamiento o al cambiar
 * los umbrales. Las alertas que siguen existiendo conservan su historial de envío.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { DAY_MS } from "@/lib/agro/format";
import { derivarAlertas, etapaEn, type Umbrales } from "@/lib/agro/status";
import { alertEmail, deliverEmail } from "./email";

/** Solo se avisa por correo de alertas de imágenes recientes, no de las encontradas en el histórico. */
const EMAIL_MAX_AGE_DAYS = Number(process.env.ALERT_EMAIL_MAX_AGE_DAYS ?? 24);

export type RecomputeResult = { opened: number; removed: number; emailed: number };

export async function recomputeAlerts(db: PrismaClient, parcelId: string, { notify = true } = {}): Promise<RecomputeResult> {
  const parcel = await db.parcel.findUnique({
    where: { id: parcelId },
    select: {
      id: true,
      name: true,
      sownAt: true,
      crop: { select: { name: true, cycleDays: true, ndviWarning: true, ndviAlert: true, ndwiWarning: true, ndwiAlert: true } },
      owner: { select: { name: true, email: true, emailAlerts: true, active: true } },
      observations: {
        where: { valid: true },
        select: { id: true, valid: true, ndvi: true, ndwi: true, acquiredAt: true, scene: { select: { platform: true } } },
      },
      alerts: { select: { id: true, observationId: true } },
    },
  });
  if (!parcel) return { opened: 0, removed: 0, emailed: 0 };

  const umbrales: Umbrales = parcel.crop;
  const derived = derivarAlertas(parcel.observations, umbrales, (o) => etapaEn(parcel.sownAt, parcel.crop.cycleDays, o.acquiredAt));
  const existing = new Map(parcel.alerts.map((a) => [a.observationId, a.id]));
  const keep = new Set(derived.map((d) => d.observationId));
  const stale = parcel.alerts.filter((a) => !keep.has(a.observationId)).map((a) => a.id);

  const created: { id: string; observationId: string }[] = [];
  await db.$transaction(async (tx) => {
    if (stale.length) await tx.alert.deleteMany({ where: { id: { in: stale } } });
    for (const d of derived) {
      const data = {
        level: d.nivel === "rojo" ? ("ALERT" as const) : ("WARNING" as const),
        index: d.indice,
        value: d.valor,
        threshold: d.umbral,
        status: d.status,
        openedAt: d.openedAt,
        closedAt: d.closedAt,
      };
      const id = existing.get(d.observationId);
      if (id) {
        await tx.alert.update({ where: { id }, data });
      } else {
        const row = await tx.alert.create({ data: { ...data, parcelId: parcel.id, observationId: d.observationId }, select: { id: true } });
        created.push({ id: row.id, observationId: d.observationId });
      }
    }
  });

  let emailed = 0;
  const baseUrl = process.env.APP_URL?.trim().replace(/\/$/, "") || null;
  for (const c of created) {
    const d = derived.find((x) => x.observationId === c.observationId)!;
    const recent = Date.now() - d.openedAt.getTime() <= EMAIL_MAX_AGE_DAYS * DAY_MS;
    const wants = notify && d.status === "ACTIVE" && recent && parcel.owner.emailAlerts && parcel.owner.active;
    if (!wants) {
      await db.alert.update({ where: { id: c.id }, data: { emailStatus: "SKIPPED" } });
      continue;
    }
    const obs = parcel.observations.find((o) => o.id === c.observationId)!;
    const result = await deliverEmail(
      alertEmail({
        to: parcel.owner.email,
        ownerName: parcel.owner.name,
        parcelName: parcel.name,
        cropName: parcel.crop.name,
        parcelUrl: baseUrl ? `${baseUrl}/dashboard/parcelas/${parcel.id}` : null,
        nivel: d.nivel,
        indice: d.indice,
        valor: d.valor,
        umbral: d.umbral,
        imageDate: d.openedAt,
        platform: obs.scene.platform,
      }),
    );
    await db.alert.update({
      where: { id: c.id },
      data: { emailStatus: result.status, emailedAt: result.status === "FAILED" ? null : new Date(), emailError: result.error ?? null },
    });
    if (result.status !== "FAILED") emailed++;
  }

  return { opened: created.length, removed: stale.length, emailed };
}
