import type { Metadata } from "next";
import { Suspense } from "react";
import { NoAccess } from "@/components/admin/no-access";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { CropsManager } from "@/components/agro/crops-manager";
import { PageHead } from "@/components/agro/semaforo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { getThresholdPreviewData, listCrops } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Cultivos y umbrales",
};

export default function CropsPage() {
  return (
    <>
      <PageHead
        eyebrow="Administración"
        title="Cultivos y umbrales de alerta"
        subtitle="Las alertas se generan solo en la etapa de desarrollo del cultivo, cuando el índice baja del umbral. Ajustarlos ayuda a reducir las falsas alarmas."
      />
      <Suspense fallback={<TableSkeleton />}>
        <CropsSection />
      </Suspense>
    </>
  );
}

async function CropsSection() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CROPS_READ)) return <NoAccess permission={PERMISSIONS.CROPS_READ} />;
  const [crops, preview] = await Promise.all([listCrops(), getThresholdPreviewData()]);
  return <CropsManager crops={crops} preview={preview} canEdit={hasPermission(user, PERMISSIONS.CROPS_UPDATE)} />;
}
