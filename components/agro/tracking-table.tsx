"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CCard, CFormInput, CFormSelect, CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from "@coreui/react";
import { NIVEL_COLOR } from "@/lib/agro/colors";
import { hectareas, num } from "@/lib/agro/format";
import { ETAPA_TXT, NIVEL_TXT } from "@/lib/agro/status";
import type { ParcelSummary } from "@/lib/server/parcel-queries";
import { estadoTexto } from "./parcel-list";
import { Punto } from "./semaforo";
import { Sparkline } from "./sparkline";

/** Tabla de prioridad de visitas para técnicos y asociaciones (historia de usuario del técnico). */
export function TrackingTable({ parcels }: { parcels: ParcelSummary[] }) {
  const router = useRouter();
  const [municipio, setMunicipio] = useState("");
  const [cultivo, setCultivo] = useState("");
  const [q, setQ] = useState("");

  const municipios = useMemo(() => [...new Set(parcels.map((p) => p.municipality))].sort(), [parcels]);
  const cultivos = useMemo(() => [...new Set(parcels.map((p) => p.crop.name))].sort(), [parcels]);
  const filas = parcels.filter(
    (p) =>
      (!municipio || p.municipality === municipio) &&
      (!cultivo || p.crop.name === cultivo) &&
      (!q || `${p.name} ${p.ownerName}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const n = (nivel: string) => filas.filter((p) => p.ultima && p.nivel === nivel).length;

  return (
    <>
      <div className="admin-toolbar mb-3">
        <CFormInput type="search" placeholder="Buscar parcela o productor…" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} className="admin-filter" />
        <CFormSelect aria-label="Municipio" className="admin-filter" value={municipio} onChange={(e) => setMunicipio(e.target.value)}>
          <option value="">Todos los municipios</option>
          {municipios.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </CFormSelect>
        <CFormSelect aria-label="Cultivo" className="admin-filter" value={cultivo} onChange={(e) => setCultivo(e.target.value)}>
          <option value="">Todos los cultivos</option>
          {cultivos.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </CFormSelect>
      </div>
      <p className="text-body-secondary">
        {filas.length} parcelas · <b className="txt-rojo">{n("rojo")} en alerta</b> · <b className="txt-amarillo">{n("amarillo")} en precaución</b> · {n("verde")} normales
      </p>
      <CCard>
        <CTable className="table-agro mb-0" responsive hover align="middle">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>#</CTableHeaderCell>
              <CTableHeaderCell>Estado</CTableHeaderCell>
              <CTableHeaderCell>Parcela</CTableHeaderCell>
              <CTableHeaderCell>Productor</CTableHeaderCell>
              <CTableHeaderCell>Municipio</CTableHeaderCell>
              <CTableHeaderCell>Cultivo</CTableHeaderCell>
              <CTableHeaderCell className="num">Área</CTableHeaderCell>
              <CTableHeaderCell>Etapa</CTableHeaderCell>
              <CTableHeaderCell>NDVI (últimas imágenes)</CTableHeaderCell>
              <CTableHeaderCell className="num">NDWI</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {filas.length === 0 && (
              <CTableRow>
                <CTableDataCell colSpan={10} className="text-center text-body-secondary py-5">
                  Ninguna parcela coincide con los filtros.
                </CTableDataCell>
              </CTableRow>
            )}
            {filas.map((p, i) => {
              const nivel = p.ultima ? p.nivel : null;
              return (
                <CTableRow key={p.id} className="clic" onClick={() => router.push(`/dashboard/parcelas/${p.id}`)}>
                  <CTableDataCell className="text-body-secondary">{i + 1}</CTableDataCell>
                  <CTableDataCell>
                    <span className="estado">
                      <Punto nivel={nivel} />
                      {nivel ? NIVEL_TXT[nivel] : "Sin datos"}
                    </span>
                  </CTableDataCell>
                  <CTableDataCell>
                    <Link href={`/dashboard/parcelas/${p.id}`} onClick={(e) => e.stopPropagation()}>
                      <strong>{p.name}</strong>
                    </Link>
                    <br />
                    <small className="text-body-secondary">{estadoTexto(p)}</small>
                  </CTableDataCell>
                  <CTableDataCell>{p.ownerName}</CTableDataCell>
                  <CTableDataCell>{p.municipality}</CTableDataCell>
                  <CTableDataCell>{p.crop.name}</CTableDataCell>
                  <CTableDataCell className="num">{hectareas(p.areaHa)}</CTableDataCell>
                  <CTableDataCell>{ETAPA_TXT[p.etapaHoy]}</CTableDataCell>
                  <CTableDataCell>
                    <span className="d-inline-flex align-items-center gap-2">
                      <Sparkline values={p.spark.slice(-10)} color={NIVEL_COLOR[nivel ?? "verde"]} width={80} height={26} />
                      <b>{num(p.ultima?.ndvi)}</b>
                    </span>
                  </CTableDataCell>
                  <CTableDataCell className="num">{num(p.ultima?.ndwi)}</CTableDataCell>
                </CTableRow>
              );
            })}
          </CTableBody>
        </CTable>
      </CCard>
    </>
  );
}
