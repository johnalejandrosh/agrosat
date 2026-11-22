import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NoAccess } from "@/components/admin/no-access";
import { TableSkeleton } from "@/components/admin/table-skeleton";
import { LocalDate } from "@/components/admin/local-date";
import { SyncButton } from "@/components/agro/sync-button";
import { PageHead } from "@/components/agro/semaforo";
import { num } from "@/lib/agro/format";
import { smtpConfigured } from "@/lib/alerts/email";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { LANDSAT } from "@/lib/landsat/config";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { db } from "@/lib/server/db";

export const metadata: Metadata = {
  title: "Procesamiento Landsat",
};

export default function ProcessingPage() {
  return (
    <>
      <PageHead
        eyebrow="Administración"
        title="Procesamiento de imágenes Landsat"
        subtitle="Descarga automática de escenas Landsat 8 y 9 (Colección 2, Nivel 2), máscara de nubes con QA_PIXEL y cálculo de NDVI y NDWI por parcela."
      />
      <Suspense fallback={<TableSkeleton />}>
        <ProcessingSection />
      </Suspense>
    </>
  );
}

const TRIGGER = { REGISTRATION: "Registro de parcela", MANUAL: "Manual", SCHEDULED: "Programado" } as const;
const STATUS = { RUNNING: "En curso", SUCCESS: "Completado", ERROR: "Error" } as const;

async function ProcessingSection() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.LANDSAT_READ)) return <NoAccess permission={PERMISSIONS.LANDSAT_READ} />;

  const [scenes, observations, valid, parcels, processing, errors, runs, lastScene] = await Promise.all([
    db.scene.count(),
    db.observation.count(),
    db.observation.count({ where: { valid: true } }),
    db.parcel.count(),
    db.parcel.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    db.parcel.count({ where: { status: "ERROR" } }),
    db.processingRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 40,
      select: {
        id: true,
        trigger: true,
        status: true,
        scenesFound: true,
        scenesProcessed: true,
        validCount: true,
        alertsOpened: true,
        message: true,
        startedAt: true,
        finishedAt: true,
        parcel: { select: { id: true, name: true } },
      },
    }),
    db.scene.findFirst({ orderBy: { acquiredAt: "desc" }, select: { id: true, acquiredAt: true } }),
  ]);

  const stats = [
    { label: "Parcelas", value: String(parcels), note: processing ? `${processing} en proceso` : errors ? `${errors} con error` : "Todas al día" },
    { label: "Escenas Landsat usadas", value: String(scenes), note: lastScene ? `Más reciente: ${lastScene.id}` : "Ninguna todavía" },
    { label: "Observaciones", value: String(observations), note: "Una por parcela y fecha de imagen" },
    { label: "Fechas sin nubes", value: observations ? `${num((100 * valid) / observations, 0)} %` : "—", note: `${valid} válidas (≤ ${LANDSAT.maxParcelCloud} % de nubes en la parcela)` },
  ];

  return (
    <>
      <div className="grid4">
        {stats.map((s) => (
          <div key={s.label} className="dato">
            <div className="titulo">{s.label}</div>
            <div className="valor">{s.value}</div>
            <div className="nota text-truncate" title={s.note}>
              {s.note}
            </div>
          </div>
        ))}
      </div>

      <div className="grid2 bloque">
        <div className="card">
          <div className="card-body">
            <h2 className="h6">Configuración</h2>
            <dl className="config-list">
              <dt>Catálogo STAC</dt>
              <dd>
                <code>{LANDSAT.stacUrl}</code> · colección <code>{LANDSAT.collection}</code>
              </dd>
              <dt>Satélites y bandas</dt>
              <dd>Landsat 8 (OLI) y 9 (OLI-2) · B4 rojo, B5 infrarrojo cercano, B6 SWIR 1 y QA_PIXEL</dd>
              <dt>Histórico</dt>
              <dd>Desde {LANDSAT.historyFrom}</dd>
              <dt>Nubes</dt>
              <dd>
                Se descartan escenas con más de {LANDSAT.maxSceneCloud} % de nubes y fechas con más de {LANDSAT.maxParcelCloud} % de la parcela cubierta
              </dd>
              <dt>Correo de alertas</dt>
              <dd>{smtpConfigured() ? "SMTP configurado" : "SMTP sin configurar: los correos se registran pero no se envían"}</dd>
              <dt>Tarea programada</dt>
              <dd>
                <code>npm run landsat:sync</code> diario desde el cron del servidor, o <code>GET /api/cron/landsat</code> con <code>CRON_SECRET</code>
                {process.env.CRON_SECRET ? " (habilitada)" : " (sin CRON_SECRET)"}
              </dd>
            </dl>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <h2 className="h6">Buscar imágenes nuevas ahora</h2>
            <p className="text-body-secondary small">
              Landsat 8 y 9 pasan por la Sabana cada ~8 días y el USGS publica la escena procesada unos días después. La sincronización revisa todas las parcelas y solo
              descarga las fechas que faltan.
            </p>
            {hasPermission(user, PERMISSIONS.LANDSAT_PROCESS) ? (
              <SyncButton disabled={processing > 0} />
            ) : (
              <p className="small text-body-secondary mb-0">Requiere el permiso «Procesar imágenes».</p>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body pb-0">
          <h2 className="h6">Bitácora de procesamiento</h2>
        </div>
        <div className="table-responsive">
        <table className="table table-hover align-middle table-agro mb-0">
          <thead>
            <tr>
              <th scope="col">Inicio</th>
              <th scope="col">Parcela</th>
              <th scope="col">Origen</th>
              <th scope="col">Estado</th>
              <th scope="col" className="num">Imágenes</th>
              <th scope="col" className="num">Válidas</th>
              <th scope="col" className="num">Alertas</th>
              <th scope="col">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-body-secondary py-4">
                  Aún no se ha procesado ninguna parcela.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="small text-nowrap">
                  <LocalDate iso={r.startedAt.toISOString()} />
                </td>
                <td>
                  <Link href={`/dashboard/parcelas/${r.parcel.id}`}>{r.parcel.name}</Link>
                </td>
                <td>{TRIGGER[r.trigger]}</td>
                <td>
                  <span className={`chip ${r.status === "SUCCESS" ? "verde" : r.status === "ERROR" ? "rojo" : "amarillo"}`}>{STATUS[r.status]}</span>
                </td>
                <td className="num">
                  {r.scenesProcessed} / {r.scenesFound}
                </td>
                <td className="num">{r.validCount}</td>
                <td className="num">{r.alertsOpened}</td>
                <td className="small text-body-secondary">
                  {r.message}
                  {r.finishedAt && <> · {Math.max(1, Math.round((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000))} s</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}
