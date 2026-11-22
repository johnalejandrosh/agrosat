/**
 * Catálogo de permisos que usa la aplicación. Compartido entre cliente, servidor y seed.
 * Estos permisos se crean como "de sistema" (no se pueden eliminar ni cambiar su clave);
 * desde la UI se pueden crear permisos adicionales para módulos futuros.
 *
 * Actores (documento del proyecto): productor agrícola, técnico o asociación y administrador.
 */

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  PARCELS_READ: "parcels.read",
  PARCELS_CREATE: "parcels.create",
  PARCELS_UPDATE: "parcels.update",
  PARCELS_DELETE: "parcels.delete",
  PARCELS_READ_ALL: "parcels.read_all",
  ALERTS_READ: "alerts.read",
  CROPS_READ: "crops.read",
  CROPS_UPDATE: "crops.update",
  LANDSAT_READ: "landsat.read",
  LANDSAT_PROCESS: "landsat.process",
  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  ROLES_READ: "roles.read",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
  PERMISSIONS_READ: "permissions.read",
  PERMISSIONS_CREATE: "permissions.create",
  PERMISSIONS_UPDATE: "permissions.update",
  PERMISSIONS_DELETE: "permissions.delete",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SYSTEM_PERMISSIONS: { key: PermissionKey; name: string; module: string; description: string }[] = [
  { key: "dashboard.view", name: "Ver inicio", module: "Inicio", description: "Panel con el estado de las parcelas propias." },
  { key: "parcels.read", name: "Ver mis parcelas", module: "Parcelas", description: "Consultar las parcelas propias, su mapa, series de tiempo y reporte." },
  { key: "parcels.create", name: "Registrar parcelas", module: "Parcelas", description: "Dibujar o cargar el límite de una parcela nueva (RF-02)." },
  { key: "parcels.update", name: "Editar parcelas", module: "Parcelas", description: "Cambiar datos, cultivo, fecha de siembra o límite de las parcelas propias." },
  { key: "parcels.delete", name: "Eliminar parcelas", module: "Parcelas", description: "Eliminar parcelas propias y su historial." },
  { key: "parcels.read_all", name: "Seguimiento técnico", module: "Parcelas", description: "Ver las parcelas de todos los productores para priorizar visitas." },
  { key: "alerts.read", name: "Ver alertas", module: "Alertas", description: "Consultar alertas activas e historial (RF-10)." },
  { key: "crops.read", name: "Ver cultivos y umbrales", module: "Cultivos", description: "Consultar los tipos de cultivo y sus umbrales de alerta." },
  { key: "crops.update", name: "Configurar umbrales", module: "Cultivos", description: "Crear cultivos y ajustar sus umbrales de alerta (RF-12)." },
  { key: "landsat.read", name: "Ver procesamiento", module: "Landsat", description: "Consultar la bitácora de descarga y procesamiento de imágenes." },
  { key: "landsat.process", name: "Procesar imágenes", module: "Landsat", description: "Lanzar la búsqueda de imágenes nuevas o reprocesar parcelas." },
  { key: "users.read", name: "Ver usuarios", module: "Usuarios", description: "Consultar la lista de usuarios." },
  { key: "users.create", name: "Crear usuarios", module: "Usuarios", description: "Dar de alta nuevos usuarios." },
  { key: "users.update", name: "Editar usuarios", module: "Usuarios", description: "Modificar datos, rol y estado de usuarios." },
  { key: "users.delete", name: "Eliminar usuarios", module: "Usuarios", description: "Eliminar usuarios de forma permanente." },
  { key: "roles.read", name: "Ver roles", module: "Roles", description: "Consultar roles y sus permisos." },
  { key: "roles.create", name: "Crear roles", module: "Roles", description: "Crear roles nuevos." },
  { key: "roles.update", name: "Editar roles", module: "Roles", description: "Cambiar nombre, descripción y permisos de un rol." },
  { key: "roles.delete", name: "Eliminar roles", module: "Roles", description: "Eliminar roles sin usuarios asignados." },
  { key: "permissions.read", name: "Ver permisos", module: "Permisos", description: "Consultar el catálogo de permisos." },
  { key: "permissions.create", name: "Crear permisos", module: "Permisos", description: "Agregar permisos al catálogo." },
  { key: "permissions.update", name: "Editar permisos", module: "Permisos", description: "Modificar nombre, módulo y descripción de permisos." },
  { key: "permissions.delete", name: "Eliminar permisos", module: "Permisos", description: "Eliminar permisos que no son del sistema." },
];

/** Roles que crea el seed. El Administrador es de sistema y tiene acceso total. */
export const ADMIN_ROLE_NAME = "Administrador";
export const TECH_ROLE_NAME = "Técnico";
/** Rol de las cuentas que se registran solas. */
export const DEFAULT_ROLE_NAME = "Productor";

const PRODUCER: PermissionKey[] = ["dashboard.view", "parcels.read", "parcels.create", "parcels.update", "parcels.delete", "alerts.read"];

export const SEED_ROLES: { name: string; description: string; isSystem: boolean; permissions: PermissionKey[] }[] = [
  {
    name: ADMIN_ROLE_NAME,
    description: "Gestiona usuarios y configura los umbrales de alerta del sistema. Acceso total.",
    isSystem: true,
    permissions: [],
  },
  {
    name: TECH_ROLE_NAME,
    description: "Técnico o asociación agrícola: consulta las parcelas de varios productores para acompañarlos.",
    isSystem: false,
    permissions: [...PRODUCER, "parcels.read_all", "crops.read", "landsat.read"],
  },
  {
    name: DEFAULT_ROLE_NAME,
    description: "Productor agrícola: registra sus parcelas, consulta su estado y recibe alertas.",
    isSystem: false,
    permissions: PRODUCER,
  },
];
