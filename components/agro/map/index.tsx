"use client";

import dynamic from "next/dynamic";
import type { DrawMapProps, PixelMapProps } from "./types";

/** Leaflet usa `window`: los mapas se cargan solo en el navegador. */
const Placeholder = () => (
  <div className="mapa mapa--cargando" aria-busy="true">
    <span className="spinner-border spinner-border-sm text-body-secondary" aria-hidden="true" /> Cargando mapa…
  </div>
);

const PixelMapLazy = dynamic(() => import("./pixel-map-impl"), { ssr: false, loading: () => <Placeholder /> });
const DrawMapLazy = dynamic(() => import("./draw-map-impl"), { ssr: false, loading: () => <Placeholder /> });

/** El contenedor reserva la altura del mapa para que no salte el contenido al cargar. */
export function PixelMap(props: PixelMapProps) {
  return (
    <div className="mapa-slot" style={{ minHeight: props.height ?? 360 }}>
      <PixelMapLazy {...props} />
    </div>
  );
}

export function DrawMap(props: DrawMapProps) {
  return (
    <div className="mapa-slot" style={{ minHeight: props.height ?? 460 }}>
      <DrawMapLazy {...props} />
    </div>
  );
}

export type { MapParcel, MapObservation } from "./types";
