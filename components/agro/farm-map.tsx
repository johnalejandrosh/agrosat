"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CFormSelect } from "@coreui/react";
import { fecha, hectareas, num, satelite } from "@/lib/agro/format";
import { clasificar, etapaEn, type Indice } from "@/lib/agro/status";
import type { DateOption, ParcelSummary } from "@/lib/server/parcel-queries";
import { IndexLegend } from "./index-legend";
import { PixelMap, type MapObservation, type MapParcel } from "./map";
import { OPCIONES_INDICE, Segmented } from "./segmented";
import { Punto } from "./semaforo";

/** Mapa de todas las parcelas del productor en una fecha de imagen (RF-06). */
export function FarmMap({ parcels, dates }: { parcels: ParcelSummary[]; dates: DateOption[] }) {
  const [indice, setIndice] = useState<Indice>("NDVI");
  const [day, setDay] = useState(dates[0]?.day ?? "");
  const [loaded, setLoaded] = useState<{ day: string; obs: MapObservation[] }>({ day: "", obs: [] });
  const observations = loaded.day === day ? loaded.obs : [];

  const mapParcels: MapParcel[] = useMemo(
    () =>
      parcels.map((p) => ({
        id: p.id,
        name: p.name,
        cropName: p.crop.name,
        areaHa: p.areaHa,
        boundary: p.boundary,
        sownAt: p.sownAt,
        cycleDays: p.crop.cycleDays,
        umbrales: p.umbrales,
      })),
    [parcels],
  );
  const byParcel = new Map(observations.map((o) => [o.parcelId, o]));
  const key = indice === "NDVI" ? "ndvi" : "ndwi";

  return (
    <div className="mapa-layout">
      <section className="card mapa-grande">
        <div className="card-body p-2">
          <PixelMap parcels={mapParcels} indice={indice} query={day ? { date: day } : null} height={580} onLoaded={(obs) => setLoaded({ day, obs })} />
        </div>
      </section>
      <aside className="card panel">
        <div className="card-body">
          <h2>Índice</h2>
          <Segmented label="Índice del mapa" value={indice} onChange={setIndice} options={OPCIONES_INDICE} />
          <h2>Imagen</h2>
          {dates.length ? (
            <CFormSelect aria-label="Fecha de la imagen" value={day} onChange={(e) => setDay(e.target.value)}>
              {dates.map((d) => (
                <option key={d.day} value={d.day}>
                  {fecha(d.day)} · {satelite(d.platform)} · {d.parcels} {d.parcels === 1 ? "parcela" : "parcelas"} sin nubes
                </option>
              ))}
            </CFormSelect>
          ) : (
            <p className="vacio">Aún no hay imágenes sin nubes.</p>
          )}
          <IndexLegend indice={indice} />
          <h2>Parcelas en esta imagen</h2>
          <ul className="lista">
            {parcels.map((p) => {
              const o = byParcel.get(p.id);
              const nivel =
                o?.valid && o.ndvi !== null
                  ? clasificar({ ...o, acquiredAt: new Date(o.acquiredAt) }, p.umbrales, etapaEn(new Date(p.sownAt), p.crop.cycleDays, new Date(o.acquiredAt))).nivel
                  : null;
              return (
                <li key={p.id}>
                  <Link className="fila" href={`/dashboard/parcelas/${p.id}`}>
                    <Punto nivel={nivel} />
                    <span className="crece">
                      <strong>{p.name}</strong>
                      <small className="text-body-secondary">
                        {p.crop.name} · {hectareas(p.areaHa)}
                      </small>
                    </span>
                    <b>{!o ? "—" : o.valid ? num(o[key]) : "Nubes"}</b>
                  </Link>
                </li>
              );
            })}
          </ul>
          <details className="ayuda">
            <summary>¿Cómo se calculan los índices?</summary>
            <p>
              <b>NDVI</b> = (B5 − B4) / (B5 + B4). Compara el infrarrojo cercano (B5) con el rojo (B4): las plantas sanas reflejan mucho infrarrojo.
            </p>
            <p>
              <b>NDWI</b> = (B5 − B6) / (B5 + B6). Compara el infrarrojo cercano (B5) con el infrarrojo de onda corta (B6), que el agua de las hojas absorbe.
            </p>
            <p>
              Se usa la reflectancia superficial de Landsat 8 (OLI) y Landsat 9 (OLI-2), Colección 2, Nivel 2. Los píxeles con nubes, sombras, cirros o nieve se
              descartan con la banda QA_PIXEL; una fecha es válida si quedan limpios al menos la mitad de los píxeles de la parcela.
            </p>
          </details>
        </div>
      </aside>
    </div>
  );
}
