/** Búsqueda de lugares (Mapbox Geocoding v6) para ubicar el lote en el mapa. Se usa en el navegador. */
export type Lugar = { id: string; nombre: string; detalle: string; municipio: string | null; lat: number; lon: number };

type Feature = {
  id: string;
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    context?: { place?: { name?: string }; locality?: { name?: string } };
  };
};

export const geocodingDisponible = () => Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

export async function buscarLugares(texto: string, signal?: AbortSignal): Promise<Lugar[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const q = texto.trim();
  if (!token || q.length < 2) return [];
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.search = new URLSearchParams({ q, limit: "6", language: "es", access_token: token }).toString();
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocodificación: HTTP ${res.status}`);
  const data = (await res.json()) as { features?: Feature[] };
  return (data.features ?? []).map((f) => ({
    id: f.id,
    nombre: f.properties.name ?? q,
    detalle: f.properties.place_formatted ?? f.properties.full_address ?? "",
    municipio: f.properties.context?.place?.name ?? null,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }));
}
