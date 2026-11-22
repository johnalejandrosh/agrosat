"use client";

import { CFooter } from "@coreui/react";

export function AppFooter() {
  return (
    <CFooter className="app-footer px-3 px-lg-4 no-print">
      <span>AgroSat · MVP v0.1 · UNAD</span>
      <span className="ms-auto text-end">
        Imágenes Landsat 8 y 9 (NASA/USGS) vía{" "}
        <a href="https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2" target="_blank" rel="noopener noreferrer">
          Planetary Computer
        </a>{" "}
        · Mapas ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>
      </span>
    </CFooter>
  );
}
