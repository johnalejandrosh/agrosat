import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon as CIcon } from "@/components/agro/icon";
import { cilPlus } from "@coreui/icons";
import { NoAccess } from "@/components/admin/no-access";
import { ParcelCard } from "@/components/agro/parcel-list";
import { LeyendaSemaforo, PageHead } from "@/components/agro/semaforo";
import { CardsSkeleton } from "@/components/agro/skeletons";
import { hectareas } from "@/lib/agro/format";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { listParcelSummaries } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Mis parcelas",
};

export default function ParcelsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHead title="Mis parcelas" />
          <CardsSkeleton />
        </>
      }
    >
      <ParcelsSection />
    </Suspense>
  );
}

async function ParcelsSection() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.PARCELS_READ)) return <NoAccess permission={PERMISSIONS.PARCELS_READ} />;

  const parcels = await listParcelSummaries({ ownerId: user.id });
  const total = parcels.reduce((s, p) => s + p.areaHa, 0);
  const canCreate = hasPermission(user, PERMISSIONS.PARCELS_CREATE);

  return (
    <>
      <PageHead
        title="Mis parcelas"
        subtitle={parcels.length ? `${parcels.length} ${parcels.length === 1 ? "parcela" : "parcelas"} · ${hectareas(total)} en total · ordenadas por prioridad` : undefined}
      >
        {canCreate && (
          <Link className="btn btn-primary d-inline-flex align-items-center gap-2" href="/dashboard/parcelas/nueva">
            <CIcon icon={cilPlus} /> Registrar parcela
          </Link>
        )}
      </PageHead>
      {parcels.length === 0 ? (
        <div className="card">
          <div className="card-body empty-state">
            <h2 className="h5">Aún no hay parcelas</h2>
            <p className="text-body-secondary mb-3">Registre su primer lote dibujándolo en el mapa o escribiendo sus coordenadas.</p>
            {canCreate && (
              <Link className="btn btn-primary" href="/dashboard/parcelas/nueva">
                Registrar parcela
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="tarjetas bloque">
            {parcels.map((p) => (
              <ParcelCard key={p.id} p={p} />
            ))}
          </div>
          <LeyendaSemaforo />
        </>
      )}
    </>
  );
}
