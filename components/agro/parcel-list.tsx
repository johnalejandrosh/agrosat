import Link from "next/link";
import { Icon as CIcon } from "@/components/agro/icon";
import { cilChevronRight } from "@coreui/icons";
import { NIVEL_COLOR } from "@/lib/agro/colors";
import { hectareas, num } from "@/lib/agro/format";
import { ETAPA_TXT, NIVEL_TXT } from "@/lib/agro/status";
import type { ParcelSummary } from "@/lib/server/parcel-queries";
import { ChipNivel, Punto } from "./semaforo";
import { Sparkline } from "./sparkline";

/** Texto de estado considerando que la parcela puede estar procesándose. */
export function estadoTexto(p: ParcelSummary): string {
  if (p.status === "PENDING" || p.status === "PROCESSING") return p.statusMessage ?? "Procesando imágenes Landsat…";
  if (p.status === "ERROR" && !p.ultima) return "No se pudieron procesar las imágenes";
  return p.resumen;
}

const sinDatos = (p: ParcelSummary) => !p.ultima;

/** Fila compacta para listas (Inicio). */
export function ParcelRow({ p }: { p: ParcelSummary }) {
  return (
    <Link className="fila" href={`/dashboard/parcelas/${p.id}`}>
      <Punto nivel={sinDatos(p) ? null : p.nivel} label={sinDatos(p) ? "Sin datos" : NIVEL_TXT[p.nivel]} />
      <span className="crece">
        <strong>{p.name}</strong>
        <small className="text-body-secondary">
          {p.crop.name} · {hectareas(p.areaHa)} · {estadoTexto(p)}
        </small>
      </span>
      <span className="valores">
        <span>
          <small>NDVI</small>
          {num(p.ultima?.ndvi)}
        </span>
        <span>
          <small>NDWI</small>
          {num(p.ultima?.ndwi)}
        </span>
      </span>
      <CIcon icon={cilChevronRight} className="fila__flecha" />
    </Link>
  );
}

/** Tarjeta tipo semáforo (Mis parcelas, figura 2 del documento). */
export function ParcelCard({ p }: { p: ParcelSummary }) {
  const nivel = sinDatos(p) ? null : p.nivel;
  return (
    <Link className="card parcela" href={`/dashboard/parcelas/${p.id}`}>
      <div className="card-body">
        <div className="parcela-cab">
          <Punto nivel={nivel} />
          <strong>{p.name}</strong>
          {p.status === "PENDING" || p.status === "PROCESSING" ? <span className="chip">Procesando</span> : <ChipNivel nivel={nivel} />}
        </div>
        <div className="text-body-secondary small">
          {p.crop.name} · {hectareas(p.areaHa)} · {ETAPA_TXT[p.etapaHoy]}
        </div>
        <p className="parcela-msg">{estadoTexto(p)}</p>
        <div className="parcela-datos">
          <div>
            <span className="text-body-secondary">NDVI</span>
            <b>{num(p.ultima?.ndvi)}</b>
          </div>
          <div>
            <span className="text-body-secondary">NDWI</span>
            <b>{num(p.ultima?.ndwi)}</b>
          </div>
          <Sparkline values={p.spark} color={NIVEL_COLOR[nivel ?? "verde"]} />
        </div>
      </div>
    </Link>
  );
}
