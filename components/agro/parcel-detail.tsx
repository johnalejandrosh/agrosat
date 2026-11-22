"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CButton,
  CDropdown,
  CDropdownDivider,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilArrowLeft, cilPencil, cilPrint, cilReload, cilTrash } from "@coreui/icons";
import { deleteParcelAction, reprocessParcelAction } from "@/app/(dashboard)/dashboard/parcelas/actions";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { DAY_MS, fecha, hectareas, num, satelite } from "@/lib/agro/format";
import { PIXEL_HA } from "@/lib/agro/geo";
import { ETAPA_TXT, NIVEL_TXT, mensajeAlerta, nivelIndice, type Indice, type Nivel } from "@/lib/agro/status";
import type { ParcelDetail } from "@/lib/server/parcel-queries";
import { AlertItem } from "./alert-item";
import { IndexLegend } from "./index-legend";
import { PixelMap, type MapParcel } from "./map";
import { OPCIONES_INDICE, Segmented } from "./segmented";
import { Punto } from "./semaforo";
import { SeriesChart, SeriesLegend, type SeriePunto } from "./series-chart";
import { StatusPoller } from "./status-poller";

function Dato({ titulo, valor, nota, nivel }: { titulo: string; valor: string; nota: string; nivel?: Nivel }) {
  return (
    <div className="dato">
      <div className="titulo">
        {nivel && <Punto nivel={nivel} />}
        {titulo}
      </div>
      <div className="valor">{valor}</div>
      <div className="nota">{nota}</div>
    </div>
  );
}

export function ParcelDetailView({ detail, generatedAt }: { detail: ParcelDetail; generatedAt: string }) {
  const { summary: p, series, alerts, access, image, runs } = detail;
  const router = useRouter();
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const validas = useMemo(
    () => series.filter((o): o is typeof o & { ndvi: number; ndwi: number } => o.valid && o.ndvi !== null && o.ndwi !== null),
    [series],
  );
  const recientes = useMemo(() => [...validas].reverse().slice(0, 10), [validas]);
  const inicial: Indice = p.motivos[0]?.indice ?? "NDVI";
  const [indMapa, setIndMapa] = useState<Indice>(inicial);
  const [indSerie, setIndSerie] = useState<Indice>(inicial);
  const [rango, setRango] = useState<"12m" | "todo">("12m");
  const [obsId, setObsId] = useState<string | null>(recientes[0]?.id ?? null);

  const ultimaObs = p.ultima ? { valid: true, ndvi: p.ultima.ndvi, ndwi: p.ultima.ndwi, acquiredAt: new Date(p.ultima.acquiredAt) } : null;
  const etapaUltima = p.ultima?.etapa ?? "sin-siembra";
  const processing = p.status === "PENDING" || p.status === "PROCESSING";

  const puntos: SeriePunto[] = useMemo(() => {
    const desde = rango === "12m" ? new Date(generatedAt).getTime() - 365 * DAY_MS : 0;
    return validas
      .filter((o) => new Date(o.acquiredAt).getTime() >= desde)
      .map((o) => ({ acquiredAt: o.acquiredAt, platform: o.platform, ndvi: o.ndvi, ndwi: o.ndwi, etapa: o.etapa }));
  }, [validas, rango, generatedAt]);

  const mapParcels: MapParcel[] = useMemo(
    () => [
      {
        id: p.id,
        name: p.name,
        cropName: p.crop.name,
        areaHa: p.areaHa,
        boundary: p.boundary,
        sownAt: p.sownAt,
        cycleDays: p.crop.cycleDays,
        umbrales: p.umbrales,
        linkToDetail: false,
      },
    ],
    [p],
  );

  const capturas = [...series].reverse().slice(0, 12);
  const pixeles = series.find((o) => o.valid)?.pixelCount ?? Math.max(1, Math.round(p.areaHa / PIXEL_HA));
  const backHref = access.isOwner ? "/dashboard/parcelas" : "/dashboard/seguimiento";

  function reprocess(full: boolean) {
    startTransition(async () => {
      const result = await reprocessParcelAction(p.id, full);
      notify(result.message ?? "", result.ok ? "success" : "danger");
    });
  }

  return (
    <>
      <div className="solo-print cab-print">
        AgroSat · Reporte de parcela · generado el {fecha(generatedAt)} · Landsat 8 y 9 (Colección 2, Nivel 2)
      </div>
      <Link className="volver no-print" href={backHref}>
        <CIcon icon={cilArrowLeft} size="sm" /> Volver
      </Link>

      <header className="page-head">
        <div className="min-w-0">
          <h1>{p.name}</h1>
          <p className="text-body-secondary mb-0">
            {p.crop.name} · {hectareas(p.areaHa)} · {p.vereda ? `Vereda ${p.vereda}, ` : ""}
            {p.municipality} · {p.ownerName}
          </p>
        </div>
        <div className="page-head__actions no-print">
          <CButton color="secondary" variant="outline" onClick={() => window.print()} disabled={validas.length === 0}>
            <CIcon icon={cilPrint} className="me-2" />
            Descargar reporte PDF
          </CButton>
          {(access.canEdit || access.canReprocess || access.canDelete) && (
            <CDropdown alignment="end">
              <CDropdownToggle color="secondary" variant="outline" disabled={pending}>
                Más
              </CDropdownToggle>
              <CDropdownMenu>
                {access.canEdit && (
                  <CDropdownItem as={Link} href={`/dashboard/parcelas/${p.id}/editar`}>
                    <CIcon icon={cilPencil} className="me-2" /> Editar parcela
                  </CDropdownItem>
                )}
                {access.canReprocess && (
                  <>
                    <CDropdownItem as="button" type="button" disabled={processing} onClick={() => reprocess(false)}>
                      <CIcon icon={cilReload} className="me-2" /> Buscar imágenes nuevas
                    </CDropdownItem>
                    <CDropdownItem as="button" type="button" disabled={processing} onClick={() => reprocess(true)}>
                      <CIcon icon={cilReload} className="me-2" /> Reprocesar todo el histórico
                    </CDropdownItem>
                  </>
                )}
                {access.canDelete && (
                  <>
                    <CDropdownDivider />
                    <CDropdownItem as="button" type="button" className="text-danger" onClick={() => setConfirmDelete(true)}>
                      <CIcon icon={cilTrash} className="me-2" /> Eliminar parcela
                    </CDropdownItem>
                  </>
                )}
              </CDropdownMenu>
            </CDropdown>
          )}
        </div>
      </header>

      {processing && (
        <div className="bloque no-print">
          <StatusPoller parcelId={p.id} initialMessage={p.statusMessage} />
        </div>
      )}
      {p.status === "ERROR" && p.statusMessage && (
        <div className="aviso bloque no-print">
          {p.statusMessage} {access.canReprocess && "Puede intentarlo de nuevo con «Más → Buscar imágenes nuevas»."}
        </div>
      )}

      {p.ultima ? (
        <section className={`estado-caja ${p.nivel}`}>
          <Punto nivel={p.nivel} grande />
          <div>
            <strong>
              {NIVEL_TXT[p.nivel]} · {p.resumen}
            </strong>
            <p>{p.motivos.length ? mensajeAlerta(p.motivos[0]) : "Los índices están dentro de lo esperado para la etapa del cultivo."}</p>
            <small className="text-body-secondary">
              Según la imagen {satelite(p.ultima.platform)} del {fecha(p.ultima.acquiredAt)}
              {image.proxima && <> · próxima pasada ≈ {fecha(image.proxima.acquiredAt)}</>}
            </small>
          </div>
        </section>
      ) : (
        !processing && (
          <section className="estado-caja">
            <Punto nivel={null} grande />
            <div>
              <strong>Sin imágenes válidas todavía</strong>
              <p>Ninguna imagen tiene la parcela libre de nubes. Las nuevas pasadas de Landsat se revisan automáticamente.</p>
            </div>
          </section>
        )
      )}

      <div className="grid4">
        <Dato
          titulo="Vigor (NDVI)"
          valor={num(p.ultima?.ndvi)}
          nivel={p.ultima ? nivelIndice(ultimaObs, p.umbrales, etapaUltima, "NDVI") : undefined}
          nota="Verdor de las plantas. Más alto, más sano."
        />
        <Dato
          titulo="Agua (NDWI)"
          valor={num(p.ultima?.ndwi)}
          nivel={p.ultima ? nivelIndice(ultimaObs, p.umbrales, etapaUltima, "NDWI") : undefined}
          nota="Agua en las hojas. Si baja, puede faltar riego."
        />
        <Dato
          titulo="Etapa del cultivo"
          valor={ETAPA_TXT[p.etapaHoy]}
          nota={`Día ${Math.max(0, p.diaHoy)} de ~${p.crop.cycleDays} · sembrado el ${fecha(p.sownAt)}`}
        />
        <Dato
          titulo="Píxeles Landsat"
          valor={`≈ ${pixeles}`}
          nota={p.areaHa < 1 ? "Parcela menor a 1 ha: los píxeles del borde pueden mezclar coberturas vecinas." : "Cada píxel cubre 30 × 30 m (0,09 ha)."}
        />
      </div>

      <div className="grid2 bloque">
        <section className="card">
          <div className="card-body">
            <div className="card-title-row">
              <h2>Mapa de la parcela</h2>
              <Segmented label="Índice del mapa" value={indMapa} onChange={setIndMapa} options={OPCIONES_INDICE} />
            </div>
            {recientes.length > 0 ? (
              <>
                <div className="fila-control no-print">
                  <label htmlFor="detalle-imagen">Imagen:</label>
                  <select id="detalle-imagen" className="form-select form-select-sm w-auto" value={obsId ?? ""} onChange={(e) => setObsId(e.target.value)}>
                    {recientes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {fecha(o.acquiredAt)} · {satelite(o.platform)} · nubes en la parcela {num(o.cloudPct, 0)} %
                      </option>
                    ))}
                  </select>
                </div>
                <PixelMap parcels={mapParcels} indice={indMapa} query={obsId ? { obs: obsId } : null} height={330} maxZoom={18} labels={false} />
                <IndexLegend indice={indMapa} />
              </>
            ) : (
              <>
                <PixelMap parcels={mapParcels} indice={indMapa} query={null} height={330} maxZoom={18} labels={false} />
                <p className="vacio mt-2">Cuando haya una imagen sin nubes se pintarán aquí los píxeles de 30 × 30 m.</p>
              </>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-body">
            <div className="card-title-row">
              <h2>Evolución en el tiempo</h2>
              <Segmented label="Índice de la gráfica" value={indSerie} onChange={setIndSerie} options={OPCIONES_INDICE} />
            </div>
            <div className="fila-control">
              <Segmented
                small
                label="Rango de fechas"
                value={rango}
                onChange={setRango}
                options={[
                  ["12m", "Últimos 12 meses"],
                  ["todo", "Desde 2021"],
                ]}
              />
              <span>{puntos.length} fechas sin nubes</span>
            </div>
            {puntos.length > 1 ? <SeriesChart puntos={puntos} umbrales={p.umbrales} indice={indSerie} /> : <p className="vacio">Aún no hay suficientes fechas sin nubes para graficar.</p>}
            <SeriesLegend />
          </div>
        </section>
      </div>

      <section className="card bloque">
        <div className="card-body pb-0">
          <div className="card-title-row mb-2">
            <h2>Imágenes Landsat recientes</h2>
            <span className="text-body-secondary small">Colección 2 · Nivel 2 · reflectancia superficial · {series.length} imágenes desde 2021</span>
          </div>
        </div>
        <CTable className="table-agro mb-0" responsive hover>
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Fecha</CTableHeaderCell>
              <CTableHeaderCell>Satélite</CTableHeaderCell>
              <CTableHeaderCell>Nubes sobre la parcela</CTableHeaderCell>
              <CTableHeaderCell>Resultado</CTableHeaderCell>
              <CTableHeaderCell className="num">NDVI</CTableHeaderCell>
              <CTableHeaderCell className="num">NDWI</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {capturas.length === 0 && (
              <CTableRow>
                <CTableDataCell colSpan={6} className="text-center text-body-secondary py-4">
                  {processing ? "Buscando imágenes…" : "No se encontraron imágenes para esta parcela."}
                </CTableDataCell>
              </CTableRow>
            )}
            {capturas.map((o) => (
              <CTableRow key={o.id}>
                <CTableDataCell>{fecha(o.acquiredAt)}</CTableDataCell>
                <CTableDataCell>{satelite(o.platform)}</CTableDataCell>
                <CTableDataCell>
                  {num(o.cloudPct, 0)} % <small className="text-body-secondary">({o.clearCount} de {o.pixelCount} píxeles limpios)</small>
                </CTableDataCell>
                <CTableDataCell>{o.valid ? <span className="ok">Válida</span> : <span className="text-body-secondary">Descartada por nubes (QA_PIXEL)</span>}</CTableDataCell>
                <CTableDataCell className="num">{num(o.ndvi)}</CTableDataCell>
                <CTableDataCell className="num">{num(o.ndwi)}</CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      </section>

      <section className="card bloque">
        <div className="card-body">
          <div className="card-title-row">
            <h2>Alertas de esta parcela</h2>
            <span className="text-body-secondary small">{alerts.length} desde la siembra</span>
          </div>
          <div className="alertas">
            {alerts.length ? alerts.map((a) => <AlertItem key={a.id} a={a} sinParcela />) : <p className="vacio">Esta parcela no ha tenido alertas.</p>}
          </div>
        </div>
      </section>

      {runs.length > 0 && (
        <details className="no-print procesos">
          <summary>Historial de procesamiento</summary>
          <ul className="lista mt-2">
            {runs.map((r) => (
              <li key={r.id} className="py-2 small">
                <strong>{fecha(r.startedAt)}</strong> · {r.trigger === "REGISTRATION" ? "Registro" : r.trigger === "MANUAL" ? "Manual" : "Programado"} ·{" "}
                {r.status === "RUNNING" ? "En curso" : r.status === "SUCCESS" ? "Completado" : "Con error"} · {r.message ?? `${r.scenesProcessed} de ${r.scenesFound} imágenes`}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        visible={confirmDelete}
        title="Eliminar parcela"
        confirmLabel="Eliminar"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteParcelAction(p.id)}
        onDone={(result) => {
          setConfirmDelete(false);
          if (result.message) notify(result.message);
          router.push(backHref);
        }}
      >
        <p className="mb-0">
          Se eliminará <strong>{p.name}</strong> con sus {series.length} observaciones y {alerts.length} alertas. Esta acción no se puede deshacer.
        </p>
      </ConfirmDialog>
    </>
  );
}
