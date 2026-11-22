"use client";

import { useEffect, useRef, useState } from "react";
import { COLOR_NUBE, NIVEL_COLOR, colorRampa } from "@/lib/agro/colors";
import { fecha, hectareas, num } from "@/lib/agro/format";
import { NIVEL_TXT, clasificar, etapaEn, type Indice } from "@/lib/agro/status";
import { L, createBaseMap, esc, observeResize } from "./leaflet-base";
import type { MapObservation, PixelMapProps } from "./types";

/**
 * Mapa con los píxeles Landsat de 30 × 30 m de cada parcela coloreados por índice
 * y el borde con el color del semáforo (RF-06, figura 3 del documento).
 */
export default function PixelMapImpl({ parcels, indice, query, height = 360, maxZoom = 17, labels = true, onLoaded }: PixelMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [observations, setObservations] = useState<MapObservation[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Crear el mapa una sola vez.
  useEffect(() => {
    const map = createBaseMap(element.current!, { center: [4.9, -74.05], zoom: 13 });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const stop = observeResize(map, element.current!);
    return () => {
      stop();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Encuadrar las parcelas.
  const boundsKey = parcels.map((p) => p.id).join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || parcels.length === 0) return;
    const bounds = L.latLngBounds(parcels.flatMap((p) => p.boundary.map(([lon, lat]) => [lat, lon] as [number, number])));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, maxZoom]);

  // Descargar los píxeles de la fecha u observación elegida.
  const queryKey = query ? ("obs" in query ? `obs=${query.obs}` : `parcelas=${boundsKey}&fecha=${query.date}`) : "";
  useEffect(() => {
    if (!queryKey) return;
    const controller = new AbortController();
    fetch(`/api/pixeles?${queryKey}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { observations: MapObservation[] }) => {
        setObservations(data.observations);
        setError(null);
        onLoaded?.(data.observations);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setError("No se pudieron cargar los píxeles de la imagen.");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  // Pintar.
  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    group.clearLayers();
    const key = indice.toLowerCase() as "ndvi" | "ndwi";
    const byParcel = new Map(observations.map((o) => [o.parcelId, o]));

    for (const p of parcels) {
      const o = byParcel.get(p.id);
      for (const px of o?.pixels ?? []) {
        const value = indice === "NDVI" ? px.v : px.w;
        L.polygon(px.c, {
          stroke: false,
          fillColor: px.n || value === null ? COLOR_NUBE : colorRampa(indice as Indice, value),
          fillOpacity: px.n ? 0.8 : 0.88,
          interactive: false,
        }).addTo(group);
      }
      const etapa = o ? etapaEn(new Date(p.sownAt), p.cycleDays, new Date(o.acquiredAt)) : null;
      const nivel = o?.valid && etapa ? clasificar({ ...o, acquiredAt: new Date(o.acquiredAt) }, p.umbrales, etapa).nivel : null;
      const polygon = L.polygon(
        p.boundary.map(([lon, lat]) => [lat, lon] as [number, number]),
        { color: nivel ? NIVEL_COLOR[nivel] : "#6f746c", weight: 3, fillOpacity: o ? 0 : 0.08 },
      ).addTo(group);
      const detalle = !o
        ? "Sin imagen en esta fecha"
        : o.valid
          ? `${indice}: <b>${num(o[key])}</b> · ${NIVEL_TXT[nivel ?? "verde"]}<br><small>Imagen del ${fecha(o.acquiredAt)}</small>`
          : `Sin dato: nubes sobre la parcela (${num(o.cloudPct, 0)} %)`;
      polygon.bindPopup(
        `<strong>${esc(p.name)}</strong><br>${esc(p.cropName)} · ${hectareas(p.areaHa)}<br>${detalle}` +
          (p.linkToDetail === false ? "" : `<br><a href="/dashboard/parcelas/${encodeURIComponent(p.id)}">Ver detalle</a>`),
      );
      if (labels) polygon.bindTooltip(esc(p.name), { permanent: true, direction: "center", className: "etiqueta-mapa" });
    }
  }, [parcels, observations, indice, labels]);

  return (
    <div className="mapa-wrap">
      <div className="mapa" ref={element} style={{ height }} role="region" aria-label="Mapa de las parcelas con los píxeles Landsat" />
      {error && <p className="error mt-2">{error}</p>}
    </div>
  );
}
