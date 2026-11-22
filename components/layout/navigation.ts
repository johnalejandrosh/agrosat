import { cilBell, cilChartLine, cilGlobeAlt, cilHome, cilLayers, cilLockLocked, cilMap, cilSatelite, cilSettings, cilSpa } from "@coreui/icons";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";

type Badge = { text: string; color: string };

export type NavLinkEntry = {
  kind: "link";
  label: string;
  href: string;
  /** Opcional en los ítems de un submenú (se muestra una viñeta). */
  icon?: string[];
  badge?: Badge;
  /** Contador dinámico que se muestra como insignia (p. ej. alertas activas). */
  counter?: "alerts";
  /** Para secciones aún no implementadas. */
  disabled?: boolean;
  /** Si se indica, el ítem solo se muestra a quien tenga este permiso. */
  permission?: PermissionKey;
  /** Marca activo solo con la ruta exacta (no sus subrutas). */
  exact?: boolean;
};

export type NavEntry =
  | { kind: "title"; label: string }
  | NavLinkEntry
  | {
      kind: "group";
      label: string;
      icon: string[];
      items: NavLinkEntry[];
    };

export const navigation: NavEntry[] = [
  { kind: "title", label: "Productor" },
  { kind: "link", label: "Inicio", href: "/dashboard", icon: cilHome, permission: PERMISSIONS.DASHBOARD_VIEW, exact: true },
  { kind: "link", label: "Mis parcelas", href: "/dashboard/parcelas", icon: cilLayers, permission: PERMISSIONS.PARCELS_READ },
  { kind: "link", label: "Mapa", href: "/dashboard/mapa", icon: cilMap, permission: PERMISSIONS.PARCELS_READ },
  { kind: "link", label: "Satélites en órbita", href: "/dashboard/satelites", icon: cilSatelite, permission: PERMISSIONS.DASHBOARD_VIEW },
  { kind: "link", label: "Alertas", href: "/dashboard/alertas", icon: cilBell, permission: PERMISSIONS.ALERTS_READ, counter: "alerts" },
  { kind: "title", label: "Técnico" },
  { kind: "link", label: "Seguimiento", href: "/dashboard/seguimiento", icon: cilChartLine, permission: PERMISSIONS.PARCELS_READ_ALL },
  { kind: "title", label: "Administración" },
  { kind: "link", label: "Cultivos y umbrales", href: "/dashboard/cultivos", icon: cilSpa, permission: PERMISSIONS.CROPS_READ },
  { kind: "link", label: "Procesamiento Landsat", href: "/dashboard/procesamiento", icon: cilGlobeAlt, permission: PERMISSIONS.LANDSAT_READ },
  {
    kind: "group",
    label: "Usuarios y acceso",
    icon: cilLockLocked,
    items: [
      { kind: "link", label: "Usuarios", href: "/dashboard/usuarios", permission: PERMISSIONS.USERS_READ },
      { kind: "link", label: "Roles", href: "/dashboard/roles", permission: PERMISSIONS.ROLES_READ },
      { kind: "link", label: "Permisos", href: "/dashboard/permisos", permission: PERMISSIONS.PERMISSIONS_READ },
    ],
  },
  { kind: "title", label: "Cuenta" },
  {
    kind: "group",
    label: "Configuración",
    icon: cilSettings,
    items: [
      { kind: "link", label: "Mi perfil", href: "/dashboard/configuracion/perfil" },
      { kind: "link", label: "Apariencia", href: "/dashboard/configuracion/temas" },
    ],
  },
];
