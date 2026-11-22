"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CProgress } from "@coreui/react";
import { parcelStatusAction } from "@/app/(dashboard)/dashboard/parcelas/actions";

/**
 * Mientras la parcela se procesa, consulta su estado cada pocos segundos y muestra el avance.
 * Al terminar, refresca la página para mostrar los índices y alertas nuevos.
 */
export function StatusPoller({ parcelId, initialMessage }: { parcelId: string; initialMessage: string | null }) {
  const router = useRouter();
  const [message, setMessage] = useState(initialMessage);

  useEffect(() => {
    let stopped = false;
    let lastRefresh = Date.now();
    const tick = async () => {
      const status = await parcelStatusAction(parcelId).catch(() => null);
      if (stopped || !status) return;
      setMessage(status.statusMessage);
      if (status.status === "READY" || status.status === "ERROR") {
        router.refresh();
        return;
      }
      // Refresco parcial cada 20 s: las fechas más recientes aparecen mientras sigue el histórico.
      if (Date.now() - lastRefresh > 20_000) {
        lastRefresh = Date.now();
        router.refresh();
      }
      timer = setTimeout(tick, 3500);
    };
    let timer = setTimeout(tick, 2500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [parcelId, router]);

  const match = message ? /(\d+) de (\d+)/.exec(message) : null;
  const percent = match && Number(match[2]) > 0 ? Math.round((100 * Number(match[1])) / Number(match[2])) : null;

  return (
    <div className="procesando" role="status" aria-live="polite">
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className="spinner-border spinner-border-sm text-primary" aria-hidden="true" />
        <strong>{message ?? "Procesando imágenes Landsat…"}</strong>
      </div>
      {percent !== null && <CProgress value={percent} className="mb-2" aria-label={`Avance ${percent} %`} />}
      <small className="text-body-secondary">
        Buscamos las imágenes Landsat 8 y 9 desde 2021 en el catálogo STAC, descartamos nubes y sombras con la banda QA_PIXEL y calculamos NDVI (B5, B4) y NDWI
        (B5, B6) para cada fecha. Puede tardar algunos minutos; puede salir de esta página.
      </small>
    </div>
  );
}
