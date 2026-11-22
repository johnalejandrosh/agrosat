"use client";

import dynamic from "next/dynamic";
import type { GlobeProps } from "./types";

/** Mapbox GL usa WebGL y `window`: el globo se carga solo en el navegador. */
const GlobeLazy = dynamic(() => import("./globe-impl"), {
  ssr: false,
  loading: () => (
    <div className="orbita-cargando" aria-busy="true">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" /> Cargando el globo…
    </div>
  ),
});

export function SatelliteGlobe(props: GlobeProps) {
  return <GlobeLazy {...props} />;
}
