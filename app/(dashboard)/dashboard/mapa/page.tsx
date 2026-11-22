import type { Metadata } from "next";
import { Suspense } from "react";
import { NoAccess } from "@/components/admin/no-access";
import { FarmMap } from "@/components/agro/farm-map";
import { PageHead } from "@/components/agro/semaforo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { listParcelSummaries, listValidDates } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Mapa",
};

export default function MapPage() {
  return (
    <>
      <PageHead title="Mapa del predio" subtitle="Cada cuadro es un píxel Landsat de 30 × 30 m coloreado según el índice." />
      <Suspense fallback={<div className="placeholder-glow"><span className="placeholder rounded w-100" style={{ height: "35rem" }} /></div>}>
        <MapSection />
      </Suspense>
    </>
  );
}

async function MapSection() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.PARCELS_READ)) return <NoAccess permission={PERMISSIONS.PARCELS_READ} />;
  const where = { ownerId: user.id };
  const [parcels, dates] = await Promise.all([listParcelSummaries(where), listValidDates(where)]);
  if (parcels.length === 0) return <p className="text-body-secondary">Registre una parcela para verla en el mapa.</p>;
  return <FarmMap parcels={parcels} dates={dates} />;
}
