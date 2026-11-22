export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

function validateEmail(email: string): string | undefined {
  if (!email) return "Escriba su correo.";
  if (!EMAIL_PATTERN.test(email)) return "Escriba un correo válido.";
}

export function validateLogin(input: { email: string; password: string }) {
  const errors: FieldErrors<"email" | "password"> = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!input.password) errors.password = "Escriba su contraseña.";
  return errors;
}

const PHONE_PATTERN = /^[+\d][\d\s-]{6,19}$/;

export function validateRegister(input: {
  name: string;
  email: string;
  phone: string;
  municipality: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
}) {
  const errors: FieldErrors<"name" | "email" | "phone" | "municipality" | "password" | "confirmPassword" | "terms"> = {};
  if (input.name.trim().length < 2) errors.name = "Escriba su nombre (mínimo 2 caracteres).";
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  if (!input.phone.trim()) errors.phone = "Escriba un teléfono de contacto.";
  else if (!PHONE_PATTERN.test(input.phone.trim())) errors.phone = "Escriba un teléfono válido (solo números).";
  if (!input.municipality.trim()) errors.municipality = "Indique su municipio.";
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (input.confirmPassword !== input.password) errors.confirmPassword = "Las contraseñas no coinciden.";
  if (!input.terms) errors.terms = "Se requiere su autorización para el tratamiento de datos (Ley 1581 de 2012).";
  return errors;
}

export const hasErrors = (errors: object) => Object.keys(errors).length > 0;
