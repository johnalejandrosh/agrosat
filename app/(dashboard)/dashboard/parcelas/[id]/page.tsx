import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ParcelDetailView } from "@/components/agro/parcel-detail";
import { PageSkeleton } from "@/components/agro/skeletons";
import { requireUser } from "@/lib/server/dal";
import { getParcelDetail } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Parcela",
};

export default function ParcelPage({ params }: PageProps<"/dashboard/parcelas/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={4} />}>
      <ParcelSection params={params} />
    </Suspense>
  );
}

async function ParcelSection({ params }: Pick<PageProps<"/dashboard/parcelas/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await getParcelDetail(user, id);
  // Sin acceso se responde igual que si no existiera (no se revela qué parcelas hay).
  if (!detail) notFound();
  return <ParcelDetailView detail={detail} generatedAt={new Date().toISOString()} />;
}
