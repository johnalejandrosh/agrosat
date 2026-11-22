import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon as CIcon } from "@/components/agro/icon";
import { cilPlus } from "@coreui/icons";
import { NoAccess } from "@/components/admin/no-access";
import { AlertItem } from "@/components/agro/alert-item";
import { ImageStrip } from "@/components/agro/image-strip";
import { ParcelRow } from "@/components/agro/parcel-list";
import { LeyendaSemaforo, PageHead, Punto } from "@/components/agro/semaforo";
import { PageSkeleton } from "@/components/agro/skeletons";
import { hectareas } from "@/lib/agro/format";
import type { Nivel } from "@/lib/agro/status";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { db } from "@/lib/server/db";
import { byAlertPriority, getImageInfo, listAlerts, listParcelSummaries } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Inicio",
};

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeSection />
    </Suspense>
  );
}

const RESUMEN: [Nivel, string][] = [
  ["verde", "Normales"],
  ["amarillo", "En precaución"],
  ["rojo", "En alerta"],
];

async function HomeSection() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.DASHBOARD_VIEW)) return <NoAccess permission={PERMISSIONS.DASHBOARD_VIEW} />;

  const where = { ownerId: user.id };
  const [parcels, image, alerts, profile] = await Promise.all([
    listParcelSummaries(where),
    getImageInfo(where),
    listAlerts({ status: "ACTIVE", parcel: where }),
    db.user.findUnique({ where: { id: user.id }, select: { municipality: true } }),
  ]);
  const activas = alerts.sort(byAlertPriority);
  const conDatos = parcels.filter((p) => p.ultima);
  const cuenta = (n: Nivel) => conDatos.filter((p) => p.nivel === n).length;
  const total = parcels.reduce((s, p) => s + p.areaHa, 0);
  const canCreate = hasPermission(user, PERMISSIONS.PARCELS_CREATE);
  const firstName = user.name.split(/\s+/)[0];

  const subtitle = [profile?.municipality, parcels.length ? `${parcels.length} ${parcels.length === 1 ? "parcela" : "parcelas"} · ${hectareas(total)}` : null]
    .filter(Boolean)
    .join(" · ");

  if (parcels.length === 0) {
    return (
      <>
        <PageHead title={`Hola, ${firstName}`} subtitle={subtitle || undefined} />
        <div className="card">
          <div className="card-body empty-state">
            <h2 className="h5">Todavía no tiene parcelas registradas</h2>
            <p className="text-body-secondary">
              Dibuje el límite de su lote en el mapa. AgroSat buscará las imágenes Landsat 8 y 9 desde 2021, calculará el vigor (NDVI) y el agua (NDWI) del cultivo y
              le avisará si algo cambia.
            </p>
            <div className="d-flex flex-wrap gap-2 justify-content-center">
              {canCreate && (
                <Link href="/dashboard/parcelas/nueva" className="btn btn-primary d-inline-flex align-items-center gap-2">
                  <CIcon icon={cilPlus} /> Registrar mi primera parcela
                </Link>
              )}
              {hasPermission(user, PERMISSIONS.PARCELS_READ_ALL) && (
                <Link href="/dashboard/seguimiento" className="btn btn-outline-primary">
                  Ir al seguimiento técnico
                </Link>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title={`Hola, ${firstName}`} subtitle={subtitle} />
      <ImageStrip info={image} />

      <div className="resumen-semaforo">
        {RESUMEN.map(([n, t]) => (
          <div key={n} className="card resumen">
            <Punto nivel={n} grande />
            <div>
              <b>{cuenta(n)}</b>
              <span>{t}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid2 bloque">
        <section className="card">
          <div className="card-body">
            <div className="card-title-row">
              <h2>Mis parcelas</h2>
              {canCreate && (
                <Link className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1" href="/dashboard/parcelas/nueva">
                  <CIcon icon={cilPlus} size="sm" /> Registrar parcela
                </Link>
              )}
            </div>
            <ul className="lista">
              {parcels.map((p) => (
                <li key={p.id}>
                  <ParcelRow p={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="card">
          <div className="card-body">
            <div className="card-title-row">
              <h2>Alertas activas</h2>
              <Link href="/dashboard/alertas">Ver todas</Link>
            </div>
            <div className="alertas">
              {activas.length ? (
                activas.slice(0, 3).map((a) => <AlertItem key={a.id} a={a} compacta />)
              ) : (
                <p className="vacio">No hay alertas activas. Sus cultivos se ven normales en la última imagen.</p>
              )}
            </div>
          </div>
        </section>
      </div>
      <LeyendaSemaforo />
    </>
  );
}
