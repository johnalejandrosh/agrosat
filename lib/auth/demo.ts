/**
 * Cuentas creadas por `npm run db:seed` (contraseña demo1234).
 * El acceso rápido solo se muestra en desarrollo.
 */
export const DEMO_PASSWORD = "demo1234";

export const DEMO_ACCOUNTS = [
  { email: "maria.gomez@ejemplo.co", label: "Productora", detail: "María Gómez · Chía" },
  { email: "tecnico@ejemplo.co", label: "Técnico", detail: "Diego Moreno · Sabana Centro" },
  { email: "admin@agrosat.co", label: "Administrador", detail: "Equipo AgroSat" },
] as const;

export const SHOW_DEMO_LOGIN = process.env.NODE_ENV === "development";
