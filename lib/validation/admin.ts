/** Esquemas de validación (Zod) de los módulos de administración. Se usan en el servidor. */
import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";

const name = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(2, { error: `${label} debe tener al menos 2 caracteres.` })
    .max(max, { error: `${label} admite hasta ${max} caracteres.` });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Admite hasta ${max} caracteres.` })
    .transform((value) => value || null);

export const userSchema = z.object({
  name: name("El nombre", 120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Ingresa un correo válido." }).max(254, { error: "Correo demasiado largo." })),
  phone: optionalText(30),
  municipality: optionalText(80),
  roleId: z.string().min(1, { error: "Elige un rol." }),
  active: z.boolean(),
  /** Autorización del titular para el tratamiento de sus datos (Ley 1581 de 2012). */
  dataConsent: z.boolean(),
  emailAlerts: z.boolean(),
  // Vacío al editar = conservar la contraseña actual.
  password: z.union([
    z.literal(""),
    z.string().min(MIN_PASSWORD_LENGTH, { error: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.` }).max(128),
  ]),
});

export const roleSchema = z.object({
  name: name("El nombre", 60),
  description: optionalText(255),
  permissionIds: z.array(z.string().min(1)),
});

/** Claves tipo "modulo.accion" en minúsculas, p. ej. "reports.export". */
export const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/;

export const permissionSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .max(80, { error: "Admite hasta 80 caracteres." })
    .regex(PERMISSION_KEY_PATTERN, { error: 'Usa el formato "modulo.accion" (minúsculas, sin espacios).' }),
  name: name("El nombre", 120),
  module: name("El módulo", 60),
  description: optionalText(255),
});

/** Convierte los errores de Zod en { campo: primer mensaje }. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const { fieldErrors } = z.flattenError(error);
  return Object.fromEntries(
    Object.entries(fieldErrors as Record<string, string[] | undefined>)
      .filter(([, messages]) => messages?.length)
      .map(([field, messages]) => [field, messages![0]]),
  );
}
