import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon as CIcon } from "@/components/agro/icon";
import { cilArrowLeft } from "@coreui/icons";
import { NoAccess } from "@/components/admin/no-access";
import { ParcelForm } from "@/components/agro/parcel-form";
import { PageHead } from "@/components/agro/semaforo";
import { ringFromJson } from "@/lib/agro/geo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { LANDSAT } from "@/lib/landsat/config";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { db } from "@/lib/server/db";

export const metadata: Metadata = {
  title: "Registrar parcela",
};

export default function NewParcelPage() {
  return (
    <>
      <Link className="volver no-print" href="/dashboard/parcelas">
        <CIcon icon={cilArrowLeft} size="sm" /> Mis parcelas
      </Link>
      <PageHead title="Registrar parcela" subtitle="Dibuje el límite de su lote en el mapa o escriba sus coordenadas." />
      <Suspense fallback={<div className="placeholder-glow"><span className="placeholder rounded w-100" style={{ height: "30rem" }} /></div>}>
        <NewParcelSection />
      </Suspense>
    </>
  );
}

async function NewParcelSection() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.PARCELS_CREATE)) return <NoAccess permission={PERMISSIONS.PARCELS_CREATE} />;

  const [crops, mine, profile] = await Promise.all([
    db.crop.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, cycleDays: true } }),
    db.parcel.findMany({ where: { ownerId: user.id }, select: { id: true, name: true, boundary: true } }),
    db.user.findUnique({ where: { id: user.id }, select: { municipality: true } }),
  ]);
  const municipality = profile?.municipality?.trim() || "Chía";

  return (
    <ParcelForm
      crops={crops}
      others={mine.map((p) => ({ id: p.id, name: p.name, boundary: ringFromJson(p.boundary) }))}
      defaultMunicipality={municipality}
      historyFrom={LANDSAT.historyFrom}
    />
  );
}
