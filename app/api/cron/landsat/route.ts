import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { syncParcels } from "@/lib/landsat/process";
import { db } from "@/lib/server/db";

/**
 * Tarea programada (RF-03): `GET /api/cron/landsat` con `Authorization: Bearer <CRON_SECRET>`.
 * Responde de inmediato y procesa en segundo plano las imágenes nuevas de todas las parcelas.
 * Alternativa sin HTTP: `npm run landsat:sync` desde el cron del servidor.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Defina CRON_SECRET para habilitar esta ruta." }, { status: 503 });

  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const parcels = await db.parcel.count();
  after(async () => {
    const results = await syncParcels(db, { trigger: "SCHEDULED" });
    const failed = results.filter((r) => r.status === "ERROR").length;
    console.info(`[AgroSat] Sincronización programada: ${results.length - failed} parcelas OK, ${failed} con error.`);
  });
  return NextResponse.json({ ok: true, parcels, message: "Sincronización iniciada." }, { status: 202 });
}
