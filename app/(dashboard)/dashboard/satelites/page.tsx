import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHead } from "@/components/agro/semaforo";
import { SatelliteGlobe } from "@/components/agro/satellites";
import type { Objetivo } from "@/components/agro/satellites/types";
import { centroid } from "@/lib/agro/geo";
import { getLandsatTle } from "@/lib/landsat/tle";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { listParcelSummaries } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Satélites en órbita",
};

const SABANA_CENTRO: Objetivo = { id: "sabana-centro", name: "Sabana Centro (Cundinamarca)", lon: -74.03, lat: 4.92 };

export default function SatellitesPage() {
  return (
    <>
      <PageHead
        eyebrow="Landsat 8 y 9"
        title="Satélites en órbita"
        subtitle="Dónde van ahora los satélites que fotografían sus cultivos, la ruta que siguen y cuándo vuelven a pasar sobre su parcela."
      />
      <Suspense fallback={<div className="orbita-cargando placeholder-glow" aria-busy="true" />}>
        <GlobeSection />
      </Suspense>
    </>
  );
}

async function GlobeSection() {
  const user = await requireUser();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return <div className="alert alert-warning">Falta configurar <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> en el archivo <code>.env</code> para mostrar el globo.</div>;
  }
  const [{ tle, fetchedAt }, parcels] = await Promise.all([
    getLandsatTle(),
    hasPermission(user, PERMISSIONS.PARCELS_READ) ? listParcelSummaries({ ownerId: user.id }) : Promise.resolve([]),
  ]);
  const objetivos: Objetivo[] = [
    ...parcels.map((p) => {
      const [lon, lat] = centroid(p.boundary);
      return { id: p.id, name: `${p.name} (${p.municipality})`, lon, lat };
    }),
    SABANA_CENTRO,
  ];
  return <SatelliteGlobe token={token} tle={tle} objetivos={objetivos} fetchedAt={fetchedAt} />;
}
