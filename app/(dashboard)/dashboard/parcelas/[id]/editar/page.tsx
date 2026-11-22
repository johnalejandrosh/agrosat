import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon as CIcon } from "@/components/agro/icon";
import { cilArrowLeft } from "@coreui/icons";
import { ParcelForm } from "@/components/agro/parcel-form";
import { PageHead } from "@/components/agro/semaforo";
import { ringFromJson } from "@/lib/agro/geo";
import { LANDSAT } from "@/lib/landsat/config";
import { requireUser } from "@/lib/server/dal";
import { db } from "@/lib/server/db";
import { getParcelForEdit } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Editar parcela",
};

export default function EditParcelPage({ params }: PageProps<"/dashboard/parcelas/[id]/editar">) {
  return (
    <Suspense fallback={<div className="placeholder-glow"><span className="placeholder rounded w-100" style={{ height: "30rem" }} /></div>}>
      <EditParcelSection params={params} />
    </Suspense>
  );
}

async function EditParcelSection({ params }: Pick<PageProps<"/dashboard/parcelas/[id]/editar">, "params">) {
  const { id } = await params;
  const user = await requireUser();
  const parcel = await getParcelForEdit(user, id);
  if (!parcel) notFound();

  const owner = await db.parcel.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
  const [crops, others] = await Promise.all([
    db.crop.findMany({ where: { OR: [{ active: true }, { id: parcel.cropId }] }, orderBy: { name: "asc" }, select: { id: true, name: true, cycleDays: true } }),
    db.parcel.findMany({ where: { ownerId: owner.ownerId, id: { not: id } }, select: { id: true, name: true, boundary: true } }),
  ]);

  return (
    <>
      <Link className="volver no-print" href={`/dashboard/parcelas/${id}`}>
        <CIcon icon={cilArrowLeft} size="sm" /> {parcel.name}
      </Link>
      <PageHead title="Editar parcela" subtitle="Corrija los datos del lote, el cultivo, la fecha de siembra o su límite." />
      <ParcelForm
        crops={crops}
        others={others.map((p) => ({ id: p.id, name: p.name, boundary: ringFromJson(p.boundary) }))}
        defaultMunicipality={parcel.municipality}
        historyFrom={LANDSAT.historyFrom}
        initial={parcel}
      />
    </>
  );
}
