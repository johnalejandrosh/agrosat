"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CFormSwitch, CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilEnvelopeClosed, cilPhone } from "@coreui/icons";
import { setEmailAlertsAction } from "@/app/(dashboard)/dashboard/alertas/actions";
import { useToast } from "@/components/providers/toast-provider";
import { fecha, num } from "@/lib/agro/format";
import { NIVEL_TXT } from "@/lib/agro/status";
import type { AlertItem as Alert } from "@/lib/server/parcel-queries";
import { AlertItem } from "./alert-item";
import { Segmented } from "./segmented";
import { Punto } from "./semaforo";

export function AlertsView({ alerts, email, phone, emailAlerts, smtp }: { alerts: Alert[]; email: string; phone: string | null; emailAlerts: boolean; smtp: boolean }) {
  const notify = useToast();
  const [tab, setTab] = useState<"activas" | "historial">("activas");
  const [enabled, setEnabled] = useState(emailAlerts);
  const [pending, startTransition] = useTransition();
  const activas = alerts.filter((a) => a.status === "ACTIVE");
  const historial = [...alerts].sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      const result = await setEmailAlertsAction(next);
      if (!result.ok) setEnabled(!next);
      notify(result.message ?? "", result.ok ? "success" : "danger");
    });
  }

  return (
    <>
      <section className="card bloque">
        <div className="card-body">
          <h2 className="h6 mb-2">Cómo le avisamos</h2>
          <div className="canal">
            <CIcon icon={cilEnvelopeClosed} size="lg" />
            <div>
              <strong>Correo electrónico</strong>
              <span className="text-body-secondary small">
                {email}
                {!smtp && " · el servidor de correo aún no está configurado: los avisos quedan registrados en la plataforma"}
              </span>
            </div>
            <CFormSwitch
              id="alertas-correo"
              label={enabled ? "Activo" : "Apagado"}
              checked={enabled}
              disabled={pending}
              onChange={(e) => toggle(e.target.checked)}
            />
          </div>
          <div className="canal deshabilitado">
            <CIcon icon={cilPhone} size="lg" />
            <div>
              <strong>WhatsApp o mensaje de texto</strong>
              <span className="text-body-secondary small">{phone ? `${phone} · ` : ""}Mejora opcional en evaluación</span>
            </div>
            <span className="chip">Próximamente</span>
          </div>
        </div>
      </section>

      <div className="bloque">
        <Segmented
          label="Alertas"
          value={tab}
          onChange={setTab}
          options={[
            ["activas", `Activas (${activas.length})`],
            ["historial", `Historial (${historial.length})`],
          ]}
        />
      </div>

      {tab === "activas" ? (
        <section className="card">
          <div className="card-body alertas">
            {activas.length ? activas.map((a) => <AlertItem key={a.id} a={a} />) : <p className="vacio">No hay alertas activas.</p>}
          </div>
        </section>
      ) : (
        <section className="card">
          <CTable className="table-agro mb-0" responsive hover>
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Fecha de la imagen</CTableHeaderCell>
                <CTableHeaderCell>Parcela</CTableHeaderCell>
                <CTableHeaderCell>Aviso</CTableHeaderCell>
                <CTableHeaderCell className="num">Valor / umbral</CTableHeaderCell>
                <CTableHeaderCell>Nivel</CTableHeaderCell>
                <CTableHeaderCell>Estado</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {historial.length === 0 && (
                <CTableRow>
                  <CTableDataCell colSpan={6} className="text-center text-body-secondary py-4">
                    Sus parcelas no han tenido alertas.
                  </CTableDataCell>
                </CTableRow>
              )}
              {historial.map((a) => (
                <CTableRow key={a.id}>
                  <CTableDataCell>{fecha(a.openedAt)}</CTableDataCell>
                  <CTableDataCell>
                    <Link href={`/dashboard/parcelas/${a.parcelId}`}>{a.parcelName}</Link>
                  </CTableDataCell>
                  <CTableDataCell>{a.titulo}</CTableDataCell>
                  <CTableDataCell className="num">
                    {a.indice} {num(a.valor)} / {num(a.umbral)}
                  </CTableDataCell>
                  <CTableDataCell>
                    <span className="estado">
                      <Punto nivel={a.nivel} />
                      {NIVEL_TXT[a.nivel]}
                    </span>
                  </CTableDataCell>
                  <CTableDataCell>
                    {a.status === "ACTIVE" ? <span className={`chip ${a.nivel}`}>Activa</span> : <span className="text-body-secondary">Cerrada el {fecha(a.closedAt!)}</span>}
                  </CTableDataCell>
                </CTableRow>
              ))}
            </CTableBody>
          </CTable>
        </section>
      )}
    </>
  );
}
