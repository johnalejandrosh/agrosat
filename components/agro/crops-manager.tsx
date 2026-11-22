"use client";

import { useMemo, useState, useTransition } from "react";
import { CBadge, CButton, CCard, CFormInput, CFormSwitch, CSpinner, CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus } from "@coreui/icons";
import { saveCropAction } from "@/app/(dashboard)/dashboard/cultivos/actions";
import { useToast } from "@/components/providers/toast-provider";
import { DEFAULT_CROPS } from "@/lib/agro/crops";
import { clasificar, derivarAlertas, erroresUmbrales, etapaEn, type Nivel, type Umbrales } from "@/lib/agro/status";
import type { CropRow, ThresholdPreviewData } from "@/lib/server/parcel-queries";

type Draft = { name: string; cycleDays: string; ndviWarning: string; ndviAlert: string; ndwiWarning: string; ndwiAlert: string; active: boolean };

const CAMPOS = [
  ["ndviWarning", "NDVI precaución"],
  ["ndviAlert", "NDVI alerta"],
  ["ndwiWarning", "NDWI precaución"],
  ["ndwiAlert", "NDWI alerta"],
] as const;

const toDraft = (c: Pick<CropRow, "name" | "cycleDays" | "ndviWarning" | "ndviAlert" | "ndwiWarning" | "ndwiAlert"> & { active?: boolean }): Draft => ({
  name: c.name,
  cycleDays: String(c.cycleDays),
  ndviWarning: String(c.ndviWarning),
  ndviAlert: String(c.ndviAlert),
  ndwiWarning: String(c.ndwiWarning),
  ndwiAlert: String(c.ndwiAlert),
  active: c.active ?? true,
});

function parse(d: Draft): { u: Umbrales; cycleDays: number } | null {
  const u = { ndviWarning: Number(d.ndviWarning), ndviAlert: Number(d.ndviAlert), ndwiWarning: Number(d.ndwiWarning), ndwiAlert: Number(d.ndwiAlert) };
  const cycleDays = Number(d.cycleDays);
  if ([d.ndviWarning, d.ndviAlert, d.ndwiWarning, d.ndwiAlert, d.cycleDays].some((v) => v.trim() === "")) return null;
  if (erroresUmbrales(u).length || !Number.isInteger(cycleDays) || cycleDays < 20 || cycleDays > 400) return null;
  return { u, cycleDays };
}

function rowError(d: Draft): string | null {
  const values = [d.ndviWarning, d.ndviAlert, d.ndwiWarning, d.ndwiAlert];
  if (values.some((v) => v.trim() === "" || !Number.isFinite(Number(v)))) return "Complete los cuatro umbrales.";
  const e = erroresUmbrales({ ndviWarning: Number(d.ndviWarning), ndviAlert: Number(d.ndviAlert), ndwiWarning: Number(d.ndwiWarning), ndwiAlert: Number(d.ndwiAlert) });
  if (e.length) return e.join(" ");
  const c = Number(d.cycleDays);
  if (!Number.isInteger(c) || c < 20 || c > 400) return "El ciclo debe estar entre 20 y 400 días.";
  return null;
}

/** Cuenta parcelas por nivel y alertas históricas con un juego de umbrales. */
function simulate(preview: ThresholdPreviewData, config: Map<string, { u: Umbrales; cycleDays: number }>) {
  const r: Record<Nivel, number> & { alertas: number } = { verde: 0, amarillo: 0, rojo: 0, alertas: 0 };
  for (const p of preview) {
    const c = config.get(p.cropId);
    if (!c || p.obs.length === 0) continue;
    const sown = new Date(p.sownAt);
    const obs = p.obs.map((o) => ({ id: o.id, valid: true, ndvi: o.v, ndwi: o.w, acquiredAt: new Date(o.t) }));
    const last = obs[obs.length - 1];
    r[clasificar(last, c.u, etapaEn(sown, c.cycleDays, last.acquiredAt)).nivel]++;
    r.alertas += derivarAlertas(obs, c.u, (o) => etapaEn(sown, c.cycleDays, o.acquiredAt)).length;
  }
  return r;
}

export function CropsManager({ crops, preview, canEdit }: { crops: CropRow[]; preview: ThresholdPreviewData; canEdit: boolean }) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(crops.map((c) => [c.id, toDraft(c)])));
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [nuevo, setNuevo] = useState<Draft | null>(null);

  // Si el servidor devuelve datos nuevos (tras guardar), se toman como punto de partida.
  const [base, setBase] = useState(crops);
  if (base !== crops) {
    setBase(crops);
    setDrafts(Object.fromEntries(crops.map((c) => [c.id, toDraft(c)])));
  }

  const actual = useMemo(() => simulate(preview, new Map(crops.map((c) => [c.id, { u: c, cycleDays: c.cycleDays }]))), [preview, crops]);
  const editado = useMemo(() => {
    const config = new Map<string, { u: Umbrales; cycleDays: number }>();
    for (const c of crops) {
      const parsed = parse(drafts[c.id] ?? toDraft(c));
      if (!parsed) return null;
      config.set(c.id, parsed);
    }
    return simulate(preview, config);
  }, [preview, crops, drafts]);
  const changed = (c: CropRow) => JSON.stringify(drafts[c.id]) !== JSON.stringify(toDraft(c));
  const anyChanged = crops.some(changed);

  function set(id: string, field: keyof Draft, value: string | boolean) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  function save(id: string | null, draft: Draft) {
    const form = new FormData();
    if (id) form.set("id", id);
    for (const [k, v] of Object.entries(draft)) {
      if (k === "active") {
        if (v) form.set("active", "on");
      } else form.set(k, String(v));
    }
    setSavingId(id ?? "nuevo");
    startTransition(async () => {
      const result = await saveCropAction({ ok: false }, form);
      setSavingId(null);
      if (result.ok) {
        notify(result.message ?? "Guardado.");
        setServerErrors((e) => ({ ...e, [id ?? "nuevo"]: "" }));
        if (!id) setNuevo(null);
      } else {
        const msg = result.message ?? Object.values(result.fieldErrors ?? {}).join(" ");
        setServerErrors((e) => ({ ...e, [id ?? "nuevo"]: msg }));
      }
    });
  }

  const sugerido = (name: string) => DEFAULT_CROPS.find((c) => c.name === name);

  return (
    <>
      <CCard className="bloque">
        <CTable className="table-agro umbrales mb-0" responsive align="middle">
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Cultivo</CTableHeaderCell>
              <CTableHeaderCell>Ciclo (días)</CTableHeaderCell>
              {CAMPOS.map(([k, t]) => (
                <CTableHeaderCell key={k}>{t}</CTableHeaderCell>
              ))}
              <CTableHeaderCell>Activo</CTableHeaderCell>
              {canEdit && <CTableHeaderCell className="text-end"><span className="visually-hidden">Acciones</span></CTableHeaderCell>}
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {crops.map((c) => {
              const d = drafts[c.id];
              const error = rowError(d) ?? (serverErrors[c.id] || null);
              const s = sugerido(c.name);
              return (
                <CTableRow key={c.id}>
                  <CTableDataCell>
                    <strong>{c.name}</strong>
                    <div className="small text-body-secondary">
                      {c.parcelCount} {c.parcelCount === 1 ? "parcela" : "parcelas"}
                    </div>
                    {error && <div className="error">{error}</div>}
                  </CTableDataCell>
                  <CTableDataCell>
                    <CFormInput type="number" size="sm" min={20} max={400} step={1} aria-label={`${c.name}: ciclo en días`} disabled={!canEdit} value={d.cycleDays} onChange={(e) => set(c.id, "cycleDays", e.target.value)} />
                  </CTableDataCell>
                  {CAMPOS.map(([k]) => (
                    <CTableDataCell key={k}>
                      <CFormInput type="number" size="sm" step={0.01} min={-1} max={1} aria-label={`${c.name}: ${k}`} disabled={!canEdit} value={d[k]} onChange={(e) => set(c.id, k, e.target.value)} />
                    </CTableDataCell>
                  ))}
                  <CTableDataCell>
                    <CFormSwitch aria-label={`${c.name} activo`} disabled={!canEdit} checked={d.active} onChange={(e) => set(c.id, "active", e.target.checked)} />
                  </CTableDataCell>
                  {canEdit && (
                    <CTableDataCell className="text-end text-nowrap">
                      {s && (
                        <CButton size="sm" color="secondary" variant="ghost" title="Restablecer valores sugeridos" onClick={() => setDrafts((x) => ({ ...x, [c.id]: { ...toDraft({ ...s, active: d.active }) } }))}>
                          Sugeridos
                        </CButton>
                      )}
                      <CButton size="sm" color="primary" disabled={!changed(c) || Boolean(rowError(d)) || pending} onClick={() => save(c.id, d)}>
                        {savingId === c.id && <CSpinner size="sm" className="me-1" aria-hidden />}
                        Guardar
                      </CButton>
                    </CTableDataCell>
                  )}
                </CTableRow>
              );
            })}
            {nuevo && (
              <CTableRow>
                <CTableDataCell>
                  <CFormInput size="sm" placeholder="Nombre del cultivo" aria-label="Nombre del cultivo nuevo" value={nuevo.name} onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })} />
                  {(rowError(nuevo) || serverErrors.nuevo) && <div className="error">{rowError(nuevo) ?? serverErrors.nuevo}</div>}
                </CTableDataCell>
                <CTableDataCell>
                  <CFormInput type="number" size="sm" aria-label="Ciclo en días" value={nuevo.cycleDays} onChange={(e) => setNuevo({ ...nuevo, cycleDays: e.target.value })} />
                </CTableDataCell>
                {CAMPOS.map(([k]) => (
                  <CTableDataCell key={k}>
                    <CFormInput type="number" size="sm" step={0.01} aria-label={k} value={nuevo[k]} onChange={(e) => setNuevo({ ...nuevo, [k]: e.target.value })} />
                  </CTableDataCell>
                ))}
                <CTableDataCell>
                  <CBadge className="bg-primary-subtle text-primary-emphasis">Nuevo</CBadge>
                </CTableDataCell>
                <CTableDataCell className="text-end text-nowrap">
                  <CButton size="sm" color="secondary" variant="ghost" onClick={() => setNuevo(null)}>
                    Cancelar
                  </CButton>
                  <CButton size="sm" color="primary" disabled={Boolean(rowError(nuevo)) || nuevo.name.trim().length < 2 || pending} onClick={() => save(null, nuevo)}>
                    {savingId === "nuevo" && <CSpinner size="sm" className="me-1" aria-hidden />}
                    Crear
                  </CButton>
                </CTableDataCell>
              </CTableRow>
            )}
          </CTableBody>
        </CTable>
      </CCard>

      <div className="vista-previa">
        {editado ? (
          <>
            Con estos umbrales: <b>{editado.rojo}</b> parcelas en alerta, <b>{editado.amarillo}</b> en precaución y <b>{editado.verde}</b> normales ·{" "}
            <b>{editado.alertas}</b> alertas en el histórico.
            {anyChanged && (
              <span className="text-body-secondary">
                {" "}
                (Ahora: {actual.rojo} / {actual.amarillo} / {actual.verde} · {actual.alertas} alertas)
              </span>
            )}
          </>
        ) : (
          <span className="error">Corrija los valores marcados para ver el efecto.</span>
        )}
      </div>

      {canEdit && !nuevo && (
        <CButton color="secondary" variant="outline" className="d-inline-flex align-items-center gap-2" onClick={() => setNuevo({ name: "", cycleDays: "100", ndviWarning: "0.55", ndviAlert: "0.4", ndwiWarning: "0.12", ndwiAlert: "0.03", active: true })}>
          <CIcon icon={cilPlus} /> Agregar cultivo
        </CButton>
      )}
      <p className="small text-body-secondary mt-3">
        Al guardar se recalculan las alertas de las parcelas de ese cultivo con todo su histórico. Las alertas que aparezcan o desaparezcan por el cambio no se envían por
        correo.
      </p>
    </>
  );
}
