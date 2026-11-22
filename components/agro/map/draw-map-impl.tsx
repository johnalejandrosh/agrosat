"use client";

import { useEffect, useRef } from "react";
import type { LonLat } from "@/lib/agro/geo";
import { L, createBaseMap, esc, observeResize } from "./leaflet-base";
import type { DrawMapProps } from "./types";

const toLatLng = ([lon, lat]: LonLat) => [lat, lon] as [number, number];

/** Mapa para dibujar el límite de la parcela con clics en cada esquina (RF-02). */
export default function DrawMapImpl({ points, onChange, center, others, height = 460 }: DrawMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawRef = useRef<L.LayerGroup | null>(null);
  const othersRef = useRef<L.LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  const pointsRef = useRef(points);
  useEffect(() => {
    onChangeRef.current = onChange;
    pointsRef.current = points;
  });

  useEffect(() => {
    const map = createBaseMap(element.current!, { center, zoom: 16, doubleClickZoom: false, satellite: true });
    mapRef.current = map;
    othersRef.current = L.layerGroup().addTo(map);
    drawRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current([...pointsRef.current, [+e.latlng.lng.toFixed(7), +e.latlng.lat.toFixed(7)]]);
    });
    const stop = observeResize(map, element.current!);
    return () => {
      stop();
      map.remove();
      mapRef.current = null;
    };
    // El centro inicial solo se usa al crear el mapa; los cambios se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al buscar un lugar, usar la ubicación del dispositivo o elegir un municipio, centrar ahí.
  useEffect(() => {
    mapRef.current?.setView(center, Math.max(mapRef.current.getZoom(), 16));
  }, [center]);

  useEffect(() => {
    const group = othersRef.current;
    if (!group) return;
    group.clearLayers();
    for (const p of others) {
      L.polygon(p.boundary.map(toLatLng), { color: "#ffffff", weight: 1.5, dashArray: "4 4", fillOpacity: 0.06, interactive: false })
        .bindTooltip(esc(p.name), { permanent: true, direction: "center", className: "etiqueta-mapa" })
        .addTo(group);
    }
  }, [others]);

  useEffect(() => {
    const group = drawRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    const latlngs = points.map(toLatLng);
    if (latlngs.length >= 3) L.polygon(latlngs, { color: "#ffd54f", weight: 2.5, fillColor: "#8bbf3f", fillOpacity: 0.25, interactive: false }).addTo(group);
    else if (latlngs.length === 2) L.polyline(latlngs, { color: "#ffd54f", weight: 2.5, interactive: false }).addTo(group);
    latlngs.forEach((pt, i) =>
      L.circleMarker(pt, { radius: i === 0 ? 7 : 5, color: "#1c201b", weight: 2, fillColor: "#ffd54f", fillOpacity: 1, interactive: false }).addTo(group),
    );
    if (latlngs.length && !latlngs.every((pt) => map.getBounds().contains(pt))) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 18 });
    }
  }, [points]);

  return <div className="mapa mapa-dibujo" ref={element} style={{ height }} role="application" aria-label="Mapa para dibujar el límite de la parcela" />;
}
