"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** Escapa texto para el HTML de popups y etiquetas de Leaflet. */
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Mapa base: OpenStreetMap (mapa) y Esri World Imagery (satélite), con control para cambiar.
 * La vista satelital ayuda al productor a reconocer su lote al dibujarlo.
 */
export function createBaseMap(element: HTMLElement, options: L.MapOptions & { satellite?: boolean } = {}) {
  const { satellite = false, ...mapOptions } = options;
  const map = L.map(element, { scrollWheelZoom: false, zoomControl: true, ...mapOptions });
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const imagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    maxNativeZoom: 18,
    attribution: "Imágenes &copy; Esri, Maxar, Earthstar Geographics",
  });
  (satellite ? imagery : osm).addTo(map);
  L.control.layers({ Mapa: osm, Satélite: imagery }, undefined, { position: "topright" }).addTo(map);
  // Zoom con la rueda solo después de hacer clic en el mapa (no secuestra el scroll de la página).
  map.once("focus", () => map.scrollWheelZoom.enable());
  return map;
}

/** Recalcula el tamaño cuando cambia el contenedor (pestañas, menú lateral…). */
export function observeResize(map: L.Map, element: HTMLElement) {
  const observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(element);
  return () => observer.disconnect();
}

export { L };
