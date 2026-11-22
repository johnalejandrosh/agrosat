/**
 * Consultas del módulo de monitoreo. Devuelven objetos serializables (fechas en ISO)
 * listos para pasar a componentes de cliente. Cada página verifica sesión y permiso
 * (DAL) antes de llamarlas; aquí se aplica además el control de acceso por parcela.
 */
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_CROPS } from "@/lib/agro/crops";
import { ringFromJson, type LonLat } from "@/lib/agro/geo";
import {
  NIVEL_ORDEN,
  clasificar,
  diaCiclo,
  etapaEn,
  mensajeAlerta,
  proximaPasada,
  resumenEstado,
  tituloAlerta,
  type Etapa,
  type Indice,
  type Motivo,
  type Nivel,
  type Umbrales,
} from "@/lib/agro/status";
import { alertEmail } from "@/lib/alerts/email";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, type CurrentUser } from "./dal";
import { db } from "./db";

// ------------------------------------------------------------------ Acceso

export type ParcelAccess = { canView: boolean; isOwner: boolean; canEdit: boolean; canDelete: boolean; canReprocess: boolean };

export function parcelAccess(user: CurrentUser, ownerId: string): ParcelAccess {
  const isOwner = ownerId === user.id;
  const canView = (isOwner && hasPermission(user, PERMISSIONS.PARCELS_READ)) || hasPermission(user, PERMISSIONS.PARCELS_READ_ALL);
  const canEdit = user.isSuperAdmin || (isOwner && hasPermission(user, PERMISSIONS.PARCELS_UPDATE));
  const canDelete = user.isSuperAdmin || (isOwner && hasPermission(user, PERMISSIONS.PARCELS_DELETE));
  return { canView, isOwner, canEdit, canDelete, canReprocess: canEdit || hasPermission(user, PERMISSIONS.LANDSAT_PROCESS) };
}

/** Filtro de parcelas visibles: las propias o todas (seguimiento técnico). */
export function visibleParcelsWhere(user: CurrentUser, scope: "mine" | "all"): Prisma.ParcelWhereInput {
  if (scope === "all" && hasPermission(user, PERMISSIONS.PARCELS_READ_ALL)) return {};
  return { ownerId: user.id };
}

// ------------------------------------------------------------------ Resúmenes

const summarySelect = {
  id: true,
  name: true,
  municipality: true,
  vereda: true,
  areaHa: true,
  sownAt: true,
  boundary: true,
  status: true,
  statusMessage: true,
  processedAt: true,
  ownerId: true,
  owner: { select: { name: true } },
  crop: { select: { id: true, name: true, cycleDays: true, ndviWarning: true, ndviAlert: true, ndwiWarning: true, ndwiAlert: true } },
  observations: {
    where: { valid: true },
    orderBy: { acquiredAt: "desc" },
    take: 12,
    select: { id: true, acquiredAt: true, ndvi: true, ndwi: true, valid: true, scene: { select: { platform: true, cloudCover: true } } },
  },
  _count: { select: { alerts: { where: { status: "ACTIVE" } } } },
} satisfies Prisma.ParcelSelect;

type SummaryRow = Prisma.ParcelGetPayload<{ select: typeof summarySelect }>;

export type ParcelSummary = {
  id: string;
  name: string;
  municipality: string;
  vereda: string | null;
  areaHa: number;
  sownAt: string;
  boundary: LonLat[];
  ownerId: string;
  ownerName: string;
  crop: { id: string; name: string; cycleDays: number };
  umbrales: Umbrales;
  status: "PENDING" | "PROCESSING" | "READY" | "ERROR";
  statusMessage: string | null;
  processedAt: string | null;
  etapaHoy: Etapa;
  diaHoy: number;
  ultima: { acquiredAt: string; platform: string; ndvi: number; ndwi: number; etapa: Etapa } | null;
  nivel: Nivel;
  motivos: Motivo[];
  resumen: string;
  activeAlerts: number;
  /** NDVI de las últimas fechas válidas, de la más antigua a la más reciente. */
  spark: number[];
};

function toSummary(row: SummaryRow, now = new Date()): ParcelSummary {
  const umbrales: Umbrales = row.crop;
  const last = row.observations[0] ?? null;
  const etapaUltima = last ? etapaEn(row.sownAt, row.crop.cycleDays, last.acquiredAt) : null;
  const c = clasificar(last, umbrales, etapaUltima ?? "sin-siembra");
  return {
    id: row.id,
    name: row.name,
    municipality: row.municipality,
    vereda: row.vereda,
    areaHa: row.areaHa,
    sownAt: row.sownAt.toISOString(),
    boundary: ringFromJson(row.boundary),
    ownerId: row.ownerId,
    ownerName: row.owner.name,
    crop: { id: row.crop.id, name: row.crop.name, cycleDays: row.crop.cycleDays },
    umbrales: {
      ndviWarning: row.crop.ndviWarning,
      ndviAlert: row.crop.ndviAlert,
      ndwiWarning: row.crop.ndwiWarning,
      ndwiAlert: row.crop.ndwiAlert,
    },
    status: row.status,
    statusMessage: row.statusMessage,
    processedAt: row.processedAt?.toISOString() ?? null,
    etapaHoy: etapaEn(row.sownAt, row.crop.cycleDays, now),
    diaHoy: diaCiclo(row.sownAt, now),
    ultima:
      last && last.ndvi !== null && last.ndwi !== null
        ? { acquiredAt: last.acquiredAt.toISOString(), platform: last.scene.platform, ndvi: last.ndvi, ndwi: last.ndwi, etapa: etapaUltima! }
        : null,
    nivel: c.nivel,
    motivos: c.motivos,
    resumen: resumenEstado(c, etapaUltima, Boolean(last)),
    activeAlerts: row._count.alerts,
    spark: row.observations
      .map((o) => o.ndvi)
      .filter((v): v is number => v !== null)
      .reverse(),
  };
}

/** Prioridad de visita: primero rojo, luego amarillo; a igual nivel, menor NDVI primero. */
export function byPriority(a: ParcelSummary, b: ParcelSummary) {
  return NIVEL_ORDEN[b.nivel] - NIVEL_ORDEN[a.nivel] || (a.ultima?.ndvi ?? 1) - (b.ultima?.ndvi ?? 1) || a.name.localeCompare(b.name, "es");
}

export async function listParcelSummaries(where: Prisma.ParcelWhereInput): Promise<ParcelSummary[]> {
  const rows = await db.parcel.findMany({ where, select: summarySelect, orderBy: { name: "asc" } });
  return rows.map((row) => toSummary(row)).sort(byPriority);
}

// ------------------------------------------------------------------ Imagen más reciente

export type ImageInfo = {
  ultima: { acquiredAt: string; platform: string; cloudCover: number | null } | null;
  proxima: { acquiredAt: string; platform: string } | null;
};

/** Última imagen válida y próxima pasada estimada para un conjunto de parcelas. */
export async function getImageInfo(where: Prisma.ParcelWhereInput): Promise<ImageInfo> {
  const [lastValid, lastAny] = await Promise.all([
    db.observation.findFirst({
      where: { valid: true, parcel: where },
      orderBy: { acquiredAt: "desc" },
      select: { acquiredAt: true, scene: { select: { platform: true, cloudCover: true } } },
    }),
    db.observation.findFirst({
      where: { parcel: where },
      orderBy: { acquiredAt: "desc" },
      select: { acquiredAt: true, scene: { select: { platform: true } } },
    }),
  ]);
  const proxima = proximaPasada(lastAny ? { acquiredAt: lastAny.acquiredAt, platform: lastAny.scene.platform } : null);
  return {
    ultima: lastValid
      ? { acquiredAt: lastValid.acquiredAt.toISOString(), platform: lastValid.scene.platform, cloudCover: lastValid.scene.cloudCover }
      : null,
    proxima: proxima ? { acquiredAt: proxima.acquiredAt.toISOString(), platform: proxima.platform } : null,
  };
}

// ------------------------------------------------------------------ Alertas

export type AlertItem = {
  id: string;
  parcelId: string;
  parcelName: string;
  ownerName: string;
  nivel: Exclude<Nivel, "verde">;
  indice: Indice;
  valor: number;
  umbral: number;
  titulo: string;
  texto: string;
  status: "ACTIVE" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  platform: string;
  emailStatus: "SENT" | "LOGGED" | "SKIPPED" | "FAILED" | null;
  emailedAt: string | null;
  email: { to: string; subject: string; text: string };
};

const alertSelect = {
  id: true,
  level: true,
  index: true,
  value: true,
  threshold: true,
  status: true,
  openedAt: true,
  closedAt: true,
  emailStatus: true,
  emailedAt: true,
  observation: { select: { scene: { select: { platform: true } } } },
  parcel: { select: { id: true, name: true, crop: { select: { name: true } }, owner: { select: { name: true, email: true } } } },
} satisfies Prisma.AlertSelect;

function toAlertItem(a: Prisma.AlertGetPayload<{ select: typeof alertSelect }>): AlertItem {
  const nivel = a.level === "ALERT" ? "rojo" : "amarillo";
  const motivo = { nivel, indice: a.index, valor: a.value, umbral: a.threshold } as const;
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  return {
    id: a.id,
    parcelId: a.parcel.id,
    parcelName: a.parcel.name,
    ownerName: a.parcel.owner.name,
    nivel,
    indice: a.index,
    valor: a.value,
    umbral: a.threshold,
    titulo: tituloAlerta(a.index, nivel),
    texto: mensajeAlerta(motivo),
    status: a.status,
    openedAt: a.openedAt.toISOString(),
    closedAt: a.closedAt?.toISOString() ?? null,
    platform: a.observation.scene.platform,
    emailStatus: a.emailStatus,
    emailedAt: a.emailedAt?.toISOString() ?? null,
    email: alertEmail({
      to: a.parcel.owner.email,
      ownerName: a.parcel.owner.name,
      parcelName: a.parcel.name,
      cropName: a.parcel.crop.name,
      parcelUrl: appUrl ? `${appUrl}/dashboard/parcelas/${a.parcel.id}` : null,
      ...motivo,
      imageDate: a.openedAt,
      platform: a.observation.scene.platform,
    }),
  };
}

export async function listAlerts(where: Prisma.AlertWhereInput, take?: number): Promise<AlertItem[]> {
  const rows = await db.alert.findMany({
    where,
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    take,
    select: alertSelect,
  });
  return rows.map(toAlertItem);
}

/** Activas primero por gravedad (rojo antes que amarillo) y luego por fecha. */
export function byAlertPriority(a: AlertItem, b: AlertItem) {
  const rank = (x: AlertItem) => (x.status === "ACTIVE" ? 2 : 0) + (x.nivel === "rojo" ? 1 : 0);
  return rank(b) - rank(a) || b.openedAt.localeCompare(a.openedAt);
}

export async function countActiveAlerts(ownerId: string): Promise<number> {
  return db.alert.count({ where: { status: "ACTIVE", parcel: { ownerId } } });
}

// ------------------------------------------------------------------ Detalle

export type SeriesPoint = {
  id: string;
  acquiredAt: string;
  platform: string;
  sceneId: string;
  sceneCloud: number | null;
  cloudPct: number;
  pixelCount: number;
  clearCount: number;
  valid: boolean;
  ndvi: number | null;
  ndwi: number | null;
  etapa: Etapa;
};

export type ParcelRun = {
  id: string;
  trigger: "REGISTRATION" | "MANUAL" | "SCHEDULED";
  status: "RUNNING" | "SUCCESS" | "ERROR";
  scenesFound: number;
  scenesProcessed: number;
  validCount: number;
  alertsOpened: number;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type ParcelDetail = {
  summary: ParcelSummary;
  ownerEmail: string;
  series: SeriesPoint[];
  alerts: AlertItem[];
  runs: ParcelRun[];
  access: ParcelAccess;
  image: ImageInfo;
};

export async function getParcelDetail(user: CurrentUser, id: string): Promise<ParcelDetail | null> {
  const row = await db.parcel.findUnique({
    where: { id },
    select: { ...summarySelect, owner: { select: { name: true, email: true } } },
  });
  if (!row) return null;
  const access = parcelAccess(user, row.ownerId);
  if (!access.canView) return null;

  const [observations, alerts, runs, image] = await Promise.all([
    db.observation.findMany({
      where: { parcelId: id },
      orderBy: { acquiredAt: "asc" },
      select: {
        id: true,
        acquiredAt: true,
        sceneId: true,
        cloudPct: true,
        pixelCount: true,
        clearCount: true,
        valid: true,
        ndvi: true,
        ndwi: true,
        scene: { select: { platform: true, cloudCover: true } },
      },
    }),
    listAlerts({ parcelId: id }),
    db.processingRun.findMany({ where: { parcelId: id }, orderBy: { startedAt: "desc" }, take: 5 }),
    getImageInfo({ id }),
  ]);

  return {
    summary: toSummary(row),
    ownerEmail: row.owner.email,
    series: observations.map((o) => ({
      id: o.id,
      acquiredAt: o.acquiredAt.toISOString(),
      platform: o.scene.platform,
      sceneId: o.sceneId,
      sceneCloud: o.scene.cloudCover,
      cloudPct: o.cloudPct,
      pixelCount: o.pixelCount,
      clearCount: o.clearCount,
      valid: o.valid,
      ndvi: o.ndvi,
      ndwi: o.ndwi,
      etapa: etapaEn(row.sownAt, row.crop.cycleDays, o.acquiredAt),
    })),
    alerts: alerts.sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
    runs: runs.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      scenesFound: r.scenesFound,
      scenesProcessed: r.scenesProcessed,
      validCount: r.validCount,
      alertsOpened: r.alertsOpened,
      message: r.message,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
    access,
    image,
  };
}

/** Datos mínimos para el formulario de edición. */
export async function getParcelForEdit(user: CurrentUser, id: string) {
  const row = await db.parcel.findUnique({
    where: { id },
    select: { id: true, name: true, ownerId: true, cropId: true, municipality: true, vereda: true, sownAt: true, boundary: true },
  });
  if (!row || !parcelAccess(user, row.ownerId).canEdit) return null;
  return {
    id: row.id,
    name: row.name,
    cropId: row.cropId,
    municipality: row.municipality,
    vereda: row.vereda ?? "",
    sownAt: row.sownAt.toISOString().slice(0, 10),
    boundary: ringFromJson(row.boundary),
  };
}

export type ParcelFormValues = NonNullable<Awaited<ReturnType<typeof getParcelForEdit>>>;

// ------------------------------------------------------------------ Mapa

/** Fechas con imagen válida en al menos una de las parcelas (las más recientes primero). */
export async function listValidDates(where: Prisma.ParcelWhereInput, take = 12) {
  const rows = await db.observation.findMany({
    where: { valid: true, parcel: where },
    orderBy: { acquiredAt: "desc" },
    take: 200,
    select: { acquiredAt: true, parcelId: true, scene: { select: { platform: true, cloudCover: true } } },
  });
  const days = new Map<string, { day: string; platform: string; cloudCover: number | null; parcels: number }>();
  for (const r of rows) {
    const day = r.acquiredAt.toISOString().slice(0, 10);
    const entry = days.get(day) ?? { day, platform: r.scene.platform, cloudCover: r.scene.cloudCover, parcels: 0 };
    entry.parcels++;
    days.set(day, entry);
  }
  return [...days.values()].slice(0, take);
}

export type DateOption = Awaited<ReturnType<typeof listValidDates>>[number];

// ------------------------------------------------------------------ Cultivos

export async function listCrops() {
  const crops = await db.crop.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      cycleDays: true,
      ndviWarning: true,
      ndviAlert: true,
      ndwiWarning: true,
      ndwiAlert: true,
      active: true,
      _count: { select: { parcels: true } },
    },
  });
  return crops.map(({ _count, ...c }) => ({ ...c, parcelCount: _count.parcels }));
}

export type CropRow = Awaited<ReturnType<typeof listCrops>>[number];

export const SUGGESTED_THRESHOLDS = Object.fromEntries(DEFAULT_CROPS.map((c) => [c.name, c]));

/**
 * Series compactas de todas las parcelas para previsualizar el efecto de cambiar umbrales
 * sin guardar: [fecha, ndvi, ndwi, etapa] de cada fecha válida.
 */
export async function getThresholdPreviewData() {
  const parcels = await db.parcel.findMany({
    select: {
      id: true,
      cropId: true,
      sownAt: true,
      observations: { where: { valid: true }, orderBy: { acquiredAt: "asc" }, select: { id: true, acquiredAt: true, ndvi: true, ndwi: true } },
    },
  });
  // La etapa se calcula en el navegador con el ciclo que se esté editando.
  return parcels.map((p) => ({
    id: p.id,
    cropId: p.cropId,
    sownAt: p.sownAt.toISOString(),
    obs: p.observations.map((o) => ({ id: o.id, t: o.acquiredAt.toISOString(), v: o.ndvi, w: o.ndwi })),
  }));
}

export type ThresholdPreviewData = Awaited<ReturnType<typeof getThresholdPreviewData>>;
