"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CAlert, CButton, CFormInput, CFormLabel, CFormSelect, CFormTextarea, CSpinner } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilActionUndo, cilLocationPin, cilSearch, cilTrash } from "@coreui/icons";
import { saveParcelAction, type SaveParcelResult } from "@/app/(dashboard)/dashboard/parcelas/actions";
import { useToast } from "@/components/providers/toast-provider";
import { MUNICIPIOS, NUEVO_CULTIVO } from "@/lib/agro/crops";
import { buscarLugares, geocodingDisponible, type Lugar } from "@/lib/agro/geocode";
import { hectareas, isoDay } from "@/lib/agro/format";
import { MIN_AREA_HA, PIXEL_HA, RECOMMENDED_MAX_AREA_HA, areaHa, centroid, openRing, parseCoordinates, validateRing, type LonLat } from "@/lib/agro/geo";
import { DrawMap } from "./map";
import { Segmented } from "./segmented";

type CropOption = { id: string; name: string; cycleDays: number };

type ParcelFormProps = {
  crops: CropOption[];
  others: { id: string; name: string; boundary: LonLat[] }[];
  defaultMunicipality: string;
  historyFrom: string;
  initial?: { id: string; name: string; cropId: string; municipality: string; vereda: string; sownAt: string; boundary: LonLat[] };
};

const idle: SaveParcelResult = { ok: false };

export function ParcelForm({ crops, others, defaultMunicipality, historyFrom, initial }: ParcelFormProps) {
  const router = useRouter();
  const notify = useToast();
  const [state, formAction, pending] = useActionState(saveParcelAction, idle);
  const [points, setPoints] = useState<LonLat[]>(initial ? openRing(initial.boundary) : []);
  const [municipality, setMunicipality] = useState(initial?.municipality ?? defaultMunicipality);
  const [mode, setMode] = useState<"mapa" | "coords">("mapa");
  const [coordsText, setCoordsText] = useState("");
  const [coordsError, setCoordsError] = useState<string | null>(null);

  const area = areaHa(points);
  const ringProblem = points.length >= 3 ? validateRing(points) : null;
  const [cropId, setCropId] = useState(initial?.cropId ?? crops[0]?.id ?? NUEVO_CULTIVO);
  const [center, setCenter] = useState<[number, number]>(() => {
    if (initial && initial.boundary.length) {
      const [lon, lat] = centroid(initial.boundary);
      return [lat, lon];
    }
    return MUNICIPIOS[municipality] ?? MUNICIPIOS["Chía"];
  });
  const [busqueda, setBusqueda] = useState("");
  const [lugares, setLugares] = useState<Lugar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [lugarError, setLugarError] = useState<string | null>(null);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok && state.parcelId) {
      if (state.message) notify(state.message);
      router.push(`/dashboard/parcelas/${state.parcelId}`);
    }
  }, [state, notify, router]);

  // Si el municipio no está entre los sugeridos, se ubica una vez en el mapa con el buscador.
  useEffect(() => {
    if (initial || MUNICIPIOS[defaultMunicipality] || !defaultMunicipality || !geocodingDisponible()) return;
    const ctrl = new AbortController();
    buscarLugares(defaultMunicipality, ctrl.signal)
      .then((r) => r[0] && setCenter([r[0].lat, r[0].lon]))
      .catch(() => {});
    return () => ctrl.abort();
  }, [initial, defaultMunicipality]);

  function cambiarMunicipio(valor: string) {
    setMunicipality(valor);
    const conocido = MUNICIPIOS[valor];
    if (conocido && points.length === 0) setCenter(conocido);
  }

  async function buscar() {
    setBuscando(true);
    setLugarError(null);
    try {
      const r = await buscarLugares(busqueda);
      setLugares(r);
      if (r.length === 0) setLugarError("No encontramos ese lugar. Pruebe con el nombre del municipio o de la vereda.");
    } catch {
      setLugarError("No se pudo buscar el lugar. Revise la conexión e intente de nuevo.");
    } finally {
      setBuscando(false);
    }
  }

  function irALugar(l: Lugar) {
    setCenter([l.lat, l.lon]);
    setLugares(null);
    if (l.municipio && !initial) setMunicipality(l.municipio);
  }

  function miUbicacion() {
    if (!navigator.geolocation) {
      setLugarError("Este navegador no permite conocer su ubicación.");
      return;
    }
    setLugarError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
      () => setLugarError("No se pudo obtener su ubicación. Revise el permiso de ubicación del navegador."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function applyCoordinates() {
    const parsed = parseCoordinates(coordsText);
    if (parsed.length < 3) {
      setCoordsError("Escriba al menos 3 puntos, uno por línea, con el formato: latitud, longitud (punto decimal).");
      return;
    }
    const problem = validateRing(parsed);
    if (problem && !problem.startsWith("La parcela es muy pequeña")) {
      setCoordsError(problem);
      return;
    }
    setCoordsError(null);
    setPoints(parsed);
    const lat = parsed.reduce((a, p) => a + p[1], 0) / parsed.length;
    const lon = parsed.reduce((a, p) => a + p[0], 0) / parsed.length;
    setCenter([lat, lon]);
  }

  return (
    <form action={formAction} className="formulario-layout" noValidate>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="boundary" value={JSON.stringify(points)} />

      <section className="card">
        <div className="card-body">
          {state.message && !state.ok && (
            <CAlert color="danger" className="py-2 small">
              {state.message}
            </CAlert>
          )}
          <div className="campo">
            <CFormLabel htmlFor="parcel-name">Nombre de la parcela</CFormLabel>
            <CFormInput
              id="parcel-name"
              name="name"
              defaultValue={initial?.name}
              placeholder="Ej.: Lote del río"
              invalid={Boolean(errors.name)}
              feedbackInvalid={errors.name}
            />
          </div>
          <div className="campo">
            <CFormLabel htmlFor="parcel-crop">Cultivo</CFormLabel>
            <CFormSelect
              id="parcel-crop"
              name="cropId"
              value={cropId}
              onChange={(e) => setCropId(e.target.value)}
              invalid={Boolean(errors.cropId)}
              feedbackInvalid={errors.cropId}
            >
              {crops.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (ciclo ~{c.cycleDays} días)
                </option>
              ))}
              <option value={NUEVO_CULTIVO}>Otro cultivo (escribirlo)…</option>
            </CFormSelect>
          </div>
          {cropId === NUEVO_CULTIVO && (
            <div className="cultivo-nuevo">
              <div className="campo">
                <CFormLabel htmlFor="parcel-new-crop">¿Qué cultivo es?</CFormLabel>
                <CFormInput
                  id="parcel-new-crop"
                  name="newCropName"
                  placeholder="Ej.: Fresa, Maíz, Cebolla larga"
                  autoComplete="off"
                  invalid={Boolean(errors.newCropName)}
                  feedbackInvalid={errors.newCropName}
                />
              </div>
              <div className="campo">
                <CFormLabel htmlFor="parcel-new-days">Días aproximados de siembra a cosecha</CFormLabel>
                <CFormInput
                  id="parcel-new-days"
                  name="newCropDays"
                  type="number"
                  inputMode="numeric"
                  min={20}
                  max={400}
                  defaultValue={120}
                  invalid={Boolean(errors.newCropDays)}
                  feedbackInvalid={errors.newCropDays}
                />
              </div>
              <small className="text-body-secondary">
                Se usarán umbrales de alerta generales para hortalizas. El administrador puede ajustarlos después en «Cultivos y umbrales».
              </small>
            </div>
          )}
          <div className="campo">
            <CFormLabel htmlFor="parcel-sown">Fecha de siembra</CFormLabel>
            <CFormInput
              id="parcel-sown"
              type="date"
              name="sownAt"
              defaultValue={initial?.sownAt}
              min={historyFrom}
              max={isoDay(new Date())}
              invalid={Boolean(errors.sownAt)}
              feedbackInvalid={errors.sownAt}
            />
            <small className="text-body-secondary">Con ella sabemos la etapa del cultivo: las alertas solo se dan en la etapa de desarrollo.</small>
          </div>
          <div className="campo">
            <CFormLabel htmlFor="parcel-municipality">Municipio</CFormLabel>
            <CFormInput
              id="parcel-municipality"
              name="municipality"
              list="parcel-municipios"
              value={municipality}
              autoComplete="off"
              placeholder="Escriba el municipio"
              onChange={(e) => cambiarMunicipio(e.target.value)}
              invalid={Boolean(errors.municipality)}
              feedbackInvalid={errors.municipality}
            />
            <datalist id="parcel-municipios">
              {Object.keys(MUNICIPIOS).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="campo">
            <CFormLabel htmlFor="parcel-vereda">Vereda (opcional)</CFormLabel>
            <CFormInput id="parcel-vereda" name="vereda" defaultValue={initial?.vereda} invalid={Boolean(errors.vereda)} feedbackInvalid={errors.vereda} />
          </div>

          <p className="area">
            Área: <b>{points.length >= 3 ? hectareas(area) : "—"}</b>
            {points.length >= 3 && <> · ≈ {Math.max(1, Math.round(area / PIXEL_HA))} píxeles Landsat de 30 × 30 m</>}
          </p>
          {area > RECOMMENDED_MAX_AREA_HA && <p className="aviso">AgroSat está pensado para parcelas menores a 5 ha. Considere dividir el lote.</p>}
          {area >= MIN_AREA_HA && area < 1 && (
            <p className="aviso">Parcela menor a 1 ha: los píxeles del borde pueden mezclar información de coberturas vecinas.</p>
          )}
          {(errors.boundary || (ringProblem && points.length >= 3)) && <p className="error">{errors.boundary ?? ringProblem}</p>}

          <div className="d-flex flex-wrap gap-2 mt-3">
            <CButton type="submit" color="primary" disabled={pending}>
              {pending && <CSpinner size="sm" className="me-2" aria-hidden />}
              {initial ? "Guardar cambios" : "Guardar y procesar"}
            </CButton>
            <Link className="btn btn-outline-secondary" href={initial ? `/dashboard/parcelas/${initial.id}` : "/dashboard/parcelas"}>
              Cancelar
            </Link>
          </div>
          {initial && <p className="small text-body-secondary mt-3 mb-0">Si cambia el límite, se volverán a procesar todas las imágenes desde {historyFrom.slice(0, 4)}.</p>}
        </div>
      </section>

      <section className="card">
        <div className="card-body">
          <div className="card-title-row mb-2">
            <Segmented
              label="Forma de ingresar el límite"
              value={mode}
              onChange={setMode}
              options={[
                ["mapa", "Dibujar en el mapa"],
                ["coords", "Escribir coordenadas"],
              ]}
            />
            <div className="d-flex gap-2">
              <CButton type="button" size="sm" color="secondary" variant="outline" disabled={!points.length} onClick={() => setPoints((ps) => ps.slice(0, -1))}>
                <CIcon icon={cilActionUndo} size="sm" className="me-1" /> Deshacer punto
              </CButton>
              <CButton type="button" size="sm" color="secondary" variant="outline" disabled={!points.length} onClick={() => setPoints([])}>
                <CIcon icon={cilTrash} size="sm" className="me-1" /> Borrar
              </CButton>
            </div>
          </div>
          {mode === "mapa" ? (
            <p className="small text-body-secondary mb-2">
              Haga clic en cada esquina del lote, en orden. Use la vista <b>Satélite</b> (arriba a la derecha) para reconocer su lote. Las líneas punteadas son sus
              otras parcelas.
            </p>
          ) : (
            <div className="mb-2">
              <CFormTextarea
                rows={4}
                value={coordsText}
                aria-label="Coordenadas del límite, una por línea"
                placeholder={"4.91040, -74.02246\n4.91023, -74.02189\n4.90882, -74.02232\n4.90899, -74.02290"}
                onChange={(e) => setCoordsText(e.target.value)}
              />
              <div className="d-flex align-items-center gap-2 mt-2">
                <CButton type="button" size="sm" color="primary" variant="outline" onClick={applyCoordinates}>
                  Usar estas coordenadas
                </CButton>
                <small className="text-body-secondary">Una por línea: latitud, longitud (como las da Google Maps o un GPS).</small>
              </div>
              {coordsError && <p className="error">{coordsError}</p>}
            </div>
          )}
          <div className="buscar-lugar">
            {geocodingDisponible() && (
              <div className="input-group input-group-sm">
                <input
                  className="form-control"
                  type="search"
                  value={busqueda}
                  placeholder="Buscar un lugar: municipio, vereda, finca…"
                  aria-label="Buscar un lugar en el mapa"
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void buscar();
                    }
                  }}
                />
                <button type="button" className="btn btn-outline-secondary" onClick={() => void buscar()} disabled={buscando || busqueda.trim().length < 2}>
                  {buscando ? <CSpinner size="sm" aria-hidden /> : <CIcon icon={cilSearch} size="sm" />} Buscar
                </button>
              </div>
            )}
            <CButton type="button" size="sm" color="secondary" variant="outline" onClick={miUbicacion}>
              <CIcon icon={cilLocationPin} size="sm" className="me-1" /> Mi ubicación
            </CButton>
          </div>
          {lugares && lugares.length > 0 && (
            <ul className="lugares" aria-label="Resultados de la búsqueda">
              {lugares.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => irALugar(l)}>
                    <b>{l.nombre}</b> <span className="text-body-secondary">{l.detalle}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lugarError && <p className="error">{lugarError}</p>}
          <DrawMap points={points} onChange={setPoints} center={center} others={others} />
        </div>
      </section>
    </form>
  );
}
