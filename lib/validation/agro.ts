/** Esquemas de validación (Zod) del módulo de monitoreo. Se usan en el servidor. */
import { z } from "zod";
import { parseDay } from "@/lib/agro/format";
import { closeRing, validateRing, type LonLat } from "@/lib/agro/geo";
import { erroresUmbrales } from "@/lib/agro/status";
import { LANDSAT } from "@/lib/landsat/config";

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, { error: min === 1 ? `Escriba ${label}.` : `${label} debe tener al menos ${min} caracteres.` })
    .max(max, { error: `Admite hasta ${max} caracteres.` });

const ringSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) throw new Error();
      return parsed.map((p) => {
        if (!Array.isArray(p) || p.length < 2) throw new Error();
        return [Number(p[0]), Number(p[1])] as LonLat;
      });
    } catch {
      ctx.addIssue({ code: "custom", message: "Marque al menos 3 puntos del límite de la parcela." });
      return z.NEVER;
    }
  })
  .superRefine((ring, ctx) => {
    const problem = validateRing(ring);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform((ring) => closeRing(ring.map(([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7] as LonLat)));

export const parcelSchema = z.object({
  name: text("un nombre para la parcela", 1, 120),
  cropId: z.string().min(1, { error: "Elija el cultivo." }),
  municipality: text("el municipio", 1, 80),
  vereda: z.string().trim().max(120, { error: "Admite hasta 120 caracteres." }).transform((v) => v || null),
  sownAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Indique la fecha de siembra." })
    .transform((v) => parseDay(v))
    .refine((d) => !Number.isNaN(d.getTime()), { error: "Fecha de siembra inválida." })
    .refine((d) => d.getTime() <= Date.now() + 86_400_000, { error: "La fecha de siembra no puede ser posterior a hoy." })
    .refine((d) => d >= parseDay(LANDSAT.historyFrom), { error: `Use una fecha de siembra desde ${LANDSAT.historyFrom.slice(0, 4)}.` }),
  boundary: ringSchema,
});

export type ParcelInput = z.infer<typeof parcelSchema>;

/** Cultivo que escribe el productor cuando el suyo no está en la lista. */
export const newCropSchema = z.object({
  newCropName: text("el nombre del cultivo", 2, 60),
  newCropDays: z.coerce
    .number({ error: "Escriba los días aproximados de siembra a cosecha." })
    .int({ error: "Use un número entero de días." })
    .min(20, { error: "Mínimo 20 días." })
    .max(400, { error: "Máximo 400 días." }),
});

const threshold = z.coerce.number({ error: "Escriba un número." }).min(-1, { error: "Mínimo -1." }).max(1, { error: "Máximo 1." });

export const cropSchema = z
  .object({
    name: text("el nombre del cultivo", 2, 60),
    cycleDays: z.coerce
      .number({ error: "Escriba los días del ciclo." })
      .int({ error: "Use un número entero de días." })
      .min(20, { error: "Mínimo 20 días." })
      .max(400, { error: "Máximo 400 días." }),
    ndviWarning: threshold,
    ndviAlert: threshold,
    ndwiWarning: threshold,
    ndwiAlert: threshold,
    active: z.boolean(),
  })
  .superRefine((c, ctx) => {
    const errors = erroresUmbrales(c);
    for (const message of errors) {
      ctx.addIssue({ code: "custom", message, path: [message.startsWith("NDWI") ? "ndwiAlert" : "ndviAlert"] });
    }
  });

export type CropInput = z.infer<typeof cropSchema>;
