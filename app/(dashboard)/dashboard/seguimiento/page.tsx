import type { Metadata } from "next";
import { Suspense } from "react";
import { NoAccess } from "@/components/admin/no-access";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { ImageStrip } from "@/components/agro/image-strip";
import { PageHead } from "@/components/agro/semaforo";
import { TrackingTable } from "@/components/agro/tracking-table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { getImageInfo, listParcelSummaries } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Seguimiento técnico",
};

export default function TrackingPage() {
  return (
    <>
      <PageHead eyebrow="Técnico o asociación" title="Seguimiento técnico" subtitle="Parcelas de los productores acompañados, ordenadas por prioridad de visita." />
      <Suspense fallback={<TableSkeleton />}>
        <TrackingSection />
      </Suspense>
    </>
  );
}

async function TrackingSection() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.PARCELS_READ_ALL)) return <NoAccess permission={PERMISSIONS.PARCELS_READ_ALL} />;
  const [parcels, image] = await Promise.all([listParcelSummaries({}), getImageInfo({})]);
  return (
    <>
      <ImageStrip info={image} />
      <TrackingTable parcels={parcels} />
    </>
  );
}
