import type { Tle } from "@/lib/landsat/tle";

/** Lugar sobre el que se calculan las próximas pasadas (región o parcela del productor). */
export type Objetivo = { id: string; name: string; lon: number; lat: number };

export type GlobeProps = { token: string; tle: Tle[]; objetivos: Objetivo[]; fetchedAt: string };
