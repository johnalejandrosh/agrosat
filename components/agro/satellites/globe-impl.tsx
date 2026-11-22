"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { SatRec } from "satellite.js";
import { franja, linea, posicion, proximasPasadas, satrecDe, traza, type Pasada, type Posicion } from "@/lib/agro/orbit";
import { num } from "@/lib/agro/format";
import type { GlobeProps, Objetivo } from "./types";

const COLOR: Record<string, string> = { "landsat-8": "#f59e0b", "landsat-9": "#38bdf8" };
const ESTILOS = {
  satelite: { label: "Satélite", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  relieve: { label: "Relieve", url: "mapbox://styles/mapbox/outdoors-v12" },
  oscuro: { label: "Oscuro", url: "mapbox://styles/mapbox/dark-v11" },
} as const;
type Estilo = keyof typeof ESTILOS;
const VELOCIDADES = [1, 10, 60, 300, 1200];

const MIN = 60_000;
const PASADO_MS = 40 * MIN;
const FUTURO_MS = 99 * MIN; // ≈ una órbita completa
const FRANJA_MS = 12 * MIN;

type Estado = { t: number; vivo: boolean; pos: Record<string, Posicion | null> };

/** Reloj simulado: t = base + (ahora − inicio) × velocidad. */
class Reloj {
  base = Date.now();
  inicio = performance.now();
  vel = 1;
  ahora() {
    return this.base + (performance.now() - this.inicio) * this.vel;
  }
  velocidad(v: number) {
    this.base = this.ahora();
    this.inicio = performance.now();
    this.vel = v;
  }
  reiniciar() {
    this.base = Date.now();
    this.inicio = performance.now();
    this.vel = 1;
  }
  enVivo(t: number) {
    return this.vel === 1 && Math.abs(t - Date.now()) < 5_000;
  }
}

const horaBogota = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "medium" });
const horaCorta = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function faltan(ms: number) {
  if (ms <= 0) return "ahora";
  const m = Math.round(ms / MIN);
  if (m < 60) return `en ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `en ${h} h ${m % 60} min`;
  return `en ${Math.floor(h / 24)} d ${h % 24} h`;
}

function latLon(p: Posicion) {
  return `${num(Math.abs(p.lat), 2)}° ${p.lat >= 0 ? "N" : "S"} · ${num(Math.abs(p.lon), 2)}° ${p.lon >= 0 ? "E" : "O"}`;
}

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });

function marcador(color: string, nombre: string) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "sat-marker";
  el.style.setProperty("--sat", color);
  el.setAttribute("aria-label", nombre);
  el.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor"><rect x="12" y="11" width="8" height="10" rx="1.5"/><rect x="1" y="13" width="9" height="6" rx="1"/><rect x="22" y="13" width="9" height="6" rx="1"/><rect x="10" y="15.25" width="2" height="1.5"/><rect x="20" y="15.25" width="2" height="1.5"/><circle cx="16" cy="24" r="1.6"/></g></svg><span>${nombre}</span>`;
  return el;
}

export default function GlobeImpl({ token, tle, objetivos, fetchedAt }: GlobeProps) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const sats = useMemo(() => tle.map((s) => ({ ...s, rec: satrecDe(s.line1, s.line2) as SatRec })), [tle]);

  // Reloj simulado (instancia estable creada una sola vez).
  const [reloj] = useState(() => new Reloj());

  const [vel, setVel] = useState(1);
  const [estilo, setEstilo] = useState<Estilo>("satelite");
  const [globo, setGlobo] = useState(true);
  const [seguir, setSeguir] = useState<string | null>(null);
  const [mostrarFranja, setMostrarFranja] = useState(true);
  const [objetivoId, setObjetivoId] = useState(objetivos[0]?.id ?? "");
  const [estado, setEstado] = useState<Estado>(() => ({ t: reloj.ahora(), vivo: true, pos: {} }));
  const [recalculo, setRecalculo] = useState(0);
  const [pasadas, setPasadas] = useState<Record<string, Pasada[]>>({});
  const [girar, setGirar] = useState(true);
  const seguirRef = useRef(seguir);
  const franjaRef = useRef(mostrarFranja);
  const girarRef = useRef(girar && globo);
  useEffect(() => {
    seguirRef.current = seguir;
    franjaRef.current = mostrarFranja;
    girarRef.current = girar && globo;
  }, [seguir, mostrarFranja, girar, globo]);

  const objetivo: Objetivo | undefined = objetivos.find((o) => o.id === objetivoId) ?? objetivos[0];

  function cambiarVelocidad(v: number) {
    reloj.velocidad(v);
    setVel(v);
    setRecalculo((n) => n + 1);
  }
  function volverAhora() {
    reloj.reiniciar();
    setVel(1);
    setRecalculo((n) => n + 1);
  }

  // Próximas pasadas sobre el lugar elegido; se recalculan cuando la primera ya ocurrió.
  const primeraPasada = Math.min(...Object.values(pasadas).map((p) => p[0]?.at.getTime() ?? Infinity));
  const caducada = estado.t > primeraPasada + MIN;
  useEffect(() => {
    if (!objetivo) return;
    const desde = reloj.ahora();
    const id = window.setTimeout(() => {
      setPasadas(Object.fromEntries(sats.map((s) => [s.id, proximasPasadas(s.rec, objetivo, desde)])));
    }, 0);
    return () => window.clearTimeout(id);
  }, [objetivo, reloj, sats, caducada, recalculo]);

  // Crear el mapa una sola vez.
  useEffect(() => {
    if (!contenedor.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: contenedor.current,
      style: ESTILOS.satelite.url,
      projection: "globe",
      center: [-74.03, 4.9],
      zoom: 1.6,
      attributionControl: true,
      language: "es",
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("dragstart", () => setSeguir(null));

    // Giro lento del globo: se pausa mientras la persona usa el mapa y se reanuda a los pocos segundos.
    const GRADOS_POR_SEGUNDO = 1.2; // una vuelta completa cada 5 minutos
    const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tocadoHasta = 0;
    const pausar = () => (tocadoHasta = performance.now() + 4000);
    for (const ev of ["mousedown", "touchstart", "wheel", "dragstart", "rotatestart", "pitchstart"] as const) map.on(ev, pausar);
    let ultimoGiro = performance.now();

    const markers = sats.map((s) => {
      const el = marcador(COLOR[s.id], s.name);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSeguir(s.id);
        const p = posicion(s.rec, new Date(reloj.ahora()));
        if (p) map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 2.6), speed: 1.4 });
      });
      return { id: s.id, m: new mapboxgl.Marker({ element: el, anchor: "center" }) };
    });

    // Si la cuenta de Mapbox no entrega las teselas de imagen satelital (p. ej. error 429),
    // se usan las imágenes mundiales de Esri bajo las etiquetas de Mapbox.
    let imagenEsri = false;
    function usarEsri() {
      if (!map.getLayer("satellite") || map.getLayer("esri-imagen")) return;
      map.addSource("esri-imagen", {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 18,
        attribution: "Imágenes © Esri, Maxar, Earthstar Geographics",
      });
      map.addLayer({ id: "esri-imagen", type: "raster", source: "esri-imagen" }, "satellite");
      map.setLayoutProperty("satellite", "visibility", "none");
    }
    map.on("error", (e) => {
      const ev = e as unknown as { sourceId?: string; error?: { status?: number } };
      if (ev.sourceId === "mapbox-satellite" && !imagenEsri) {
        imagenEsri = true;
        usarEsri();
      }
    });

    function capas() {
      if (imagenEsri) usarEsri();
      map.setFog({
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(8, 10, 22)",
        "star-intensity": 0.6,
      });
      if (!map.getSource("objetivos")) {
        map.addSource("objetivos", { type: "geojson", data: fc([]) });
        map.addLayer({ id: "objetivos-halo", type: "circle", source: "objetivos", paint: { "circle-radius": 9, "circle-color": "#22c55e", "circle-opacity": 0.25 } });
        map.addLayer({ id: "objetivos", type: "circle", source: "objetivos", paint: { "circle-radius": 4, "circle-color": "#22c55e", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
        map.addLayer({
          id: "objetivos-txt",
          type: "symbol",
          source: "objetivos",
          minzoom: 4,
          layout: { "text-field": ["get", "name"], "text-size": 12, "text-offset": [0, 1.2], "text-anchor": "top" },
          paint: { "text-color": "#fff", "text-halo-color": "#14532d", "text-halo-width": 1.4 },
        });
      }
      for (const s of sats) {
        const c = COLOR[s.id];
        if (map.getSource(`franja-${s.id}`)) continue;
        map.addSource(`franja-${s.id}`, { type: "geojson", data: fc([]) });
        map.addSource(`pasada-${s.id}`, { type: "geojson", data: fc([]) });
        map.addSource(`futura-${s.id}`, { type: "geojson", data: fc([]) });
        map.addLayer({ id: `franja-${s.id}`, type: "fill", source: `franja-${s.id}`, paint: { "fill-color": c, "fill-opacity": 0.22, "fill-outline-color": c } });
        map.addLayer({ id: `pasada-${s.id}`, type: "line", source: `pasada-${s.id}`, paint: { "line-color": c, "line-width": 2, "line-opacity": 0.45, "line-dasharray": [2, 2] } });
        map.addLayer({ id: `futura-${s.id}`, type: "line", source: `futura-${s.id}`, layout: { "line-cap": "round" }, paint: { "line-color": c, "line-width": 2.4, "line-opacity": 0.9 } });
      }
      pintarObjetivos();
      ultimoCalculo = { sim: -Infinity, real: 0 };
    }

    function pintarObjetivos() {
      const src = map.getSource("objetivos") as GeoJSONSource | undefined;
      src?.setData(
        fc(objetivos.map((o) => ({ type: "Feature", properties: { name: o.name }, geometry: { type: "Point", coordinates: [o.lon, o.lat] } }))),
      );
    }

    let ultimoCalculo = { sim: -Infinity, real: 0 };
    let ultimoEstado = 0;
    let frame = 0;
    function tick() {
      const t = reloj.ahora();
      const fecha = new Date(t);
      const pos: Record<string, Posicion | null> = {};
      for (const s of sats) {
        const p = posicion(s.rec, fecha);
        pos[s.id] = p;
        const mk = markers.find((m) => m.id === s.id)!;
        if (p) {
          mk.m.setLngLat([p.lon, p.lat]);
          if (!mk.m.getElement().isConnected) mk.m.addTo(map);
        }
      }
      const real = performance.now();
      // Las trazas se recalculan cada ~20 s simulados (y como máximo 5 veces por segundo).
      if (map.isStyleLoaded() && Math.abs(t - ultimoCalculo.sim) > 20_000 && real - ultimoCalculo.real > 200) {
        ultimoCalculo = { sim: t, real };
        for (const s of sats) {
          const pasado = traza(s.rec, t - PASADO_MS, t, 30);
          const futuro = traza(s.rec, t, t + FUTURO_MS, 30);
          const ahoraPto = pos[s.id];
          if (ahoraPto) {
            pasado.push(ahoraPto);
            futuro.unshift(ahoraPto);
          }
          const line = (coords: [number, number][]): GeoJSON.Feature => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
          (map.getSource(`pasada-${s.id}`) as GeoJSONSource | undefined)?.setData(fc([line(linea(pasado))]));
          (map.getSource(`futura-${s.id}`) as GeoJSONSource | undefined)?.setData(fc([line(linea(futuro))]));
          const anillo = franjaRef.current ? franja(traza(s.rec, t, t + FRANJA_MS, 20)) : [];
          (map.getSource(`franja-${s.id}`) as GeoJSONSource | undefined)?.setData(
            fc(anillo.length ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [anillo] } }] : []),
          );
        }
      }
      const sigue = seguirRef.current && pos[seguirRef.current];
      if (sigue && !map.isMoving()) map.jumpTo({ center: [sigue.lon, sigue.lat] });
      const dt = Math.min(real - ultimoGiro, 100) / 1000;
      ultimoGiro = real;
      if (!sigue && girarRef.current && !movimientoReducido && real > tocadoHasta && map.getZoom() < 4 && !map.isMoving()) {
        const c = map.getCenter();
        // Mismo sentido que la rotación real de la Tierra (de oeste a este).
        map.jumpTo({ center: [c.lng - GRADOS_POR_SEGUNDO * dt, c.lat] });
      }
      if (real - ultimoEstado > 250) {
        ultimoEstado = real;
        setEstado({ t, vivo: reloj.enVivo(t), pos });
      }
      frame = requestAnimationFrame(tick);
    }

    map.on("style.load", capas);
    frame = requestAnimationFrame(tick);
    (map as unknown as { __forzarTrazas: () => void }).__forzarTrazas = () => (ultimoCalculo = { sim: -Infinity, real: 0 });
    return () => {
      cancelAnimationFrame(frame);
      markers.forEach((m) => m.m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [token, sats, objetivos, reloj]);

  // Cambios de estilo, proyección y franja.
  const primerEstilo = useRef(true);
  useEffect(() => {
    if (primerEstilo.current) {
      primerEstilo.current = false;
      return;
    }
    mapRef.current?.setStyle(ESTILOS[estilo].url);
  }, [estilo]);
  useEffect(() => {
    mapRef.current?.setProjection(globo ? "globe" : "mercator");
  }, [globo]);
  useEffect(() => {
    (mapRef.current as unknown as { __forzarTrazas?: () => void } | null)?.__forzarTrazas?.();
  }, [mostrarFranja, vel]);

  function irA(o: Objetivo) {
    setSeguir(null);
    mapRef.current?.flyTo({ center: [o.lon, o.lat], zoom: 7.5, speed: 1.4 });
  }

  const enVivo = estado.vivo;

  return (
    <div className="orbita">
      <div className="orbita-mapa">
        <div ref={contenedor} className="orbita-canvas" />
        <div className="orbita-reloj" aria-live="off">
          <span className={`orbita-vivo ${enVivo ? "on" : ""}`}>{enVivo ? "EN VIVO" : `×${vel}`}</span>
          <span>{horaBogota.format(estado.t)} (hora de Colombia)</span>
        </div>
      </div>

      <aside className="orbita-panel">
        <section>
          <h2>Simulación</h2>
          <div className="btn-group btn-group-sm w-100" role="group" aria-label="Velocidad de la simulación">
            {VELOCIDADES.map((v) => (
              <button key={v} type="button" className={`btn ${vel === v ? "btn-primary" : "btn-outline-primary"}`} onClick={() => cambiarVelocidad(v)}>
                ×{v}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary w-100 mt-2" onClick={volverAhora} disabled={enVivo}>
            Volver a la hora real
          </button>
          <div className="orbita-opciones">
            <div className="btn-group btn-group-sm" role="group" aria-label="Estilo del mapa">
              {(Object.keys(ESTILOS) as Estilo[]).map((k) => (
                <button key={k} type="button" className={`btn ${estilo === k ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => setEstilo(k)}>
                  {ESTILOS[k].label}
                </button>
              ))}
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="orb-globo" checked={globo} onChange={(e) => setGlobo(e.target.checked)} />
              <label className="form-check-label" htmlFor="orb-globo">Vista de globo 3D</label>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="orb-girar" checked={girar} disabled={!globo} onChange={(e) => setGirar(e.target.checked)} />
              <label className="form-check-label" htmlFor="orb-girar">Girar el globo lentamente</label>
            </div>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id="orb-franja" checked={mostrarFranja} onChange={(e) => setMostrarFranja(e.target.checked)} />
              <label className="form-check-label" htmlFor="orb-franja">Franja que observa el sensor (185 km)</label>
            </div>
          </div>
        </section>

        {sats.map((s) => {
          const p = estado.pos[s.id];
          const prox = pasadas[s.id];
          const activo = seguir === s.id;
          return (
            <section key={s.id} className={`orbita-sat ${activo ? "activo" : ""}`} style={{ ["--sat" as string]: COLOR[s.id] }}>
              <header>
                <i className="orbita-punto" />
                <h2>{s.name}</h2>
                <button type="button" className={`btn btn-sm ${activo ? "btn-primary" : "btn-outline-primary"} ms-auto`} onClick={() => setSeguir(activo ? null : s.id)} aria-pressed={activo}>
                  {activo ? "Siguiendo" : "Seguir"}
                </button>
              </header>
              {p ? (
                <dl>
                  <dt>Sobre</dt>
                  <dd>{latLon(p)}</dd>
                  <dt>Altitud</dt>
                  <dd>{num(p.alt, 0)} km</dd>
                  <dt>Velocidad</dt>
                  <dd>{num(p.vel * 3600, 0)} km/h</dd>
                </dl>
              ) : (
                <p className="text-body-secondary small mb-0">Calculando posición…</p>
              )}
              {objetivo && (
                <div className="orbita-pasadas">
                  <span className="text-body-secondary">Próximas pasadas sobre {objetivo.name}:</span>
                  {!prox ? (
                    <span className="text-body-secondary">calculando…</span>
                  ) : prox.length === 0 ? (
                    <span className="text-body-secondary">ninguna en el próximo mes</span>
                  ) : (
                    <ol>
                      {prox.map((x) => (
                        <li key={x.at.getTime()}>
                          <b>{horaCorta.format(x.at)}</b> <span className="text-body-secondary">· {faltan(x.at.getTime() - estado.t)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {objetivos.length > 0 && (
          <section>
            <h2>Lugares</h2>
            <select className="form-select form-select-sm" value={objetivo?.id} onChange={(e) => setObjetivoId(e.target.value)} aria-label="Lugar para calcular las pasadas">
              {objetivos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            {objetivo && (
              <button type="button" className="btn btn-sm btn-outline-secondary w-100 mt-2" onClick={() => irA(objetivo)}>
                Ver en el mapa
              </button>
            )}
          </section>
        )}

        <p className="orbita-nota">
          Posición calculada con el modelo SGP4 a partir de los elementos orbitales (TLE) de CelesTrak, actualizados el {horaCorta.format(new Date(fetchedAt))}. Línea continua: ruta de la próxima órbita (≈ 99 min); punteada: los últimos 40 min. Los dos satélites
          van desfasados 8 días y juntos vuelven a pasar sobre el mismo lugar cada 8 días.
        </p>
      </aside>
    </div>
  );
}
