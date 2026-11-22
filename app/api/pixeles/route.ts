import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/server/dal";
import { db } from "@/lib/server/db";
import { parcelAccess } from "@/lib/server/parcel-queries";

/**
 * Píxeles Landsat de una o varias parcelas para pintar el mapa (RF-06).
 *   ?obs=<observationId>                     una observación concreta
 *   ?parcelas=<id>,<id>&fecha=YYYY-MM-DD     la observación de cada parcela en esa fecha
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const obsId = params.get("obs");
  const ids = (params.get("parcelas") ?? "").split(",").filter(Boolean).slice(0, 100);
  const day = params.get("fecha");

  const select = {
    id: true,
    parcelId: true,
    acquiredAt: true,
    valid: true,
    ndvi: true,
    ndwi: true,
    cloudPct: true,
    pixels: true,
    parcel: { select: { ownerId: true } },
  } as const;

  let rows;
  if (obsId) {
    rows = await db.observation.findMany({ where: { id: obsId }, select });
  } else if (ids.length && day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86_400_000);
    rows = await db.observation.findMany({ where: { parcelId: { in: ids }, acquiredAt: { gte: start, lt: end } }, select });
  } else {
    return NextResponse.json({ error: "Parámetros incompletos." }, { status: 400 });
  }

  const visible = rows.filter((r) => parcelAccess(user, r.parcel.ownerId).canView);
  return NextResponse.json(
    {
      observations: visible.map((r) => ({
        id: r.id,
        parcelId: r.parcelId,
        acquiredAt: r.acquiredAt.toISOString(),
        valid: r.valid,
        ndvi: r.ndvi,
        ndwi: r.ndwi,
        cloudPct: r.cloudPct,
        pixels: r.pixels,
      })),
    },
    { headers: { "cache-control": "private, max-age=300" } },
  );
}
