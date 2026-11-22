import type { LonLat } from "@/lib/agro/geo";
import type { Indice, Umbrales } from "@/lib/agro/status";

export type MapParcel = {
  id: string;
  name: string;
  cropName: string;
  areaHa: number;
  boundary: LonLat[];
  sownAt: string;
  cycleDays: number;
  umbrales: Umbrales;
  linkToDetail?: boolean;
};

export type MapPixel = { c: [number, number][]; v: number | null; w: number | null; n: boolean };

export type MapObservation = {
  id: string;
  parcelId: string;
  acquiredAt: string;
  valid: boolean;
  ndvi: number | null;
  ndwi: number | null;
  cloudPct: number;
  pixels: MapPixel[] | null;
};

export type PixelMapProps = {
  parcels: MapParcel[];
  indice: Indice;
  /** Observación concreta o fecha (YYYY-MM-DD) para todas las parcelas. */
  query: { obs: string } | { date: string } | null;
  height?: number;
  maxZoom?: number;
  labels?: boolean;
  onLoaded?: (observations: MapObservation[]) => void;
};

export type DrawMapProps = {
  points: LonLat[];
  onChange: (points: LonLat[]) => void;
  center: [lat: number, lon: number];
  others: { id: string; name: string; boundary: LonLat[] }[];
  height?: number;
};
