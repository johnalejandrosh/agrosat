"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import type { Plugin } from "chart.js";
import { NIVEL_COLOR } from "@/lib/agro/colors";
import { fecha, mesAnio, num, satelite } from "@/lib/agro/format";
import { ETAPA_TXT, clasificar, type Etapa, type Indice, type Umbrales } from "@/lib/agro/status";
import { cssVar } from "@/lib/theme/chart-colors";
import { useThemeSignature } from "@/lib/theme/color-mode";

export type SeriePunto = { acquiredAt: string; platform: string; ndvi: number; ndwi: number; etapa: Etapa };

type ZonesOptions = { fuera: boolean[]; lineas: { v: number; c: string; t: string }[]; fill: string; surface: string };

/** Sombrea las fechas fuera de la etapa de desarrollo y dibuja las líneas de umbral. */
const zonesPlugin: Plugin<"line", ZonesOptions> = {
  id: "zonas",
  beforeDatasetsDraw(chart, _args, options) {
    const { ctx, chartArea: area, scales } = chart;
    const x = scales.x;
    const y = scales.y;
    const fuera = options.fuera ?? [];
    ctx.save();
    if (fuera.length > 1) {
      const step = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
      ctx.fillStyle = options.fill;
      for (let k = 0; k < fuera.length; ) {
        if (!fuera[k]) {
          k++;
          continue;
        }
        let j = k;
        while (j + 1 < fuera.length && fuera[j + 1]) j++;
        const x0 = Math.max(area.left, x.getPixelForValue(k) - step);
        const x1 = Math.min(area.right, x.getPixelForValue(j) + step);
        ctx.fillRect(x0, area.top, x1 - x0, area.bottom - area.top);
        k = j + 1;
      }
    }
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.font = `11px ${Chart.defaults.font.family ?? "system-ui, sans-serif"}`;
    for (const l of options.lineas ?? []) {
      const py = y.getPixelForValue(l.v);
      ctx.strokeStyle = l.c;
      ctx.beginPath();
      ctx.moveTo(area.left, py);
      ctx.lineTo(area.right, py);
      ctx.stroke();
      // Etiqueta con fondo de la tarjeta para que no se confunda con los puntos de la serie.
      const w = ctx.measureText(l.t).width;
      ctx.fillStyle = options.surface;
      ctx.fillRect(area.left + 2, py - 15, w + 8, 13);
      ctx.fillStyle = l.c;
      ctx.textAlign = "left";
      ctx.fillText(l.t, area.left + 6, py - 4);
    }
    ctx.restore();
  },
};

/** Evolución del NDVI o NDWI de la parcela con el color del semáforo en cada fecha (RF-07). */
export function SeriesChart({ puntos, umbrales, indice }: { puntos: SeriePunto[]; umbrales: Umbrales; indice: Indice }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useThemeSignature();

  useEffect(() => {
    if (!canvas.current) return;
    const key = indice === "NDVI" ? "ndvi" : "ndwi";
    const gris = cssVar("--agro-gris", "#9aa095");
    const colores = puntos.map((o) =>
      o.etapa !== "desarrollo" ? gris : NIVEL_COLOR[clasificar({ valid: true, ndvi: o.ndvi, ndwi: o.ndwi, acquiredAt: new Date(o.acquiredAt) }, umbrales, o.etapa).nivel],
    );
    const [aviso, alerta] = indice === "NDVI" ? [umbrales.ndviWarning, umbrales.ndviAlert] : [umbrales.ndwiWarning, umbrales.ndwiAlert];
    const muted = cssVar("--cui-secondary-color", "#5f655b");
    // Misma tipografía que el resto de la app (Chart.js usa Helvetica por defecto).
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const chart = new Chart(canvas.current, {
      type: "line",
      data: {
        labels: puntos.map((o) => o.acquiredAt),
        datasets: [
          {
            data: puntos.map((o) => Math.round(o[key] * 1000) / 1000),
            borderColor: indice === "NDVI" ? cssVar("--app-chart-1", "#2f6b3a") : cssVar("--app-chart-2", "#2f6690"),
            borderWidth: 2,
            tension: 0.3,
            pointRadius: puntos.length > 80 ? 2.4 : 3.6,
            pointHoverRadius: 5.5,
            pointBackgroundColor: colores,
            pointBorderColor: colores,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const o = puntos[items[0].dataIndex];
                return `${fecha(o.acquiredAt)} · ${satelite(o.platform)}`;
              },
              label: (item) => `${indice}: ${num(item.raw as number)}`,
              afterLabel: (item) => `Etapa: ${ETAPA_TXT[puntos[item.dataIndex].etapa]}`,
            },
          },
          // @ts-expect-error opciones del plugin propio "zonas"
          zonas: {
            fuera: puntos.map((o) => o.etapa !== "desarrollo"),
            fill: cssVar("--viz-zone", "#f0f0ec"),
            surface: cssVar("--app-card-bg", "#ffffff"),
            lineas: [
              { v: aviso, c: cssVar("--agro-amarillo-txt", "#8a5d00"), t: `Precaución ${num(aviso)}` },
              { v: alerta, c: cssVar("--agro-rojo", "#c62828"), t: `Alerta ${num(alerta)}` },
            ],
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: muted, autoSkip: true, maxTicksLimit: 7, maxRotation: 0, callback: (_v, i) => mesAnio(puntos[i].acquiredAt) },
          },
          y: {
            min: indice === "NDVI" ? 0 : -0.3,
            max: indice === "NDVI" ? 1 : 0.7,
            ticks: { color: muted, stepSize: indice === "NDVI" ? 0.2 : 0.1, callback: (v) => num(Number(v), 1) },
            grid: { color: cssVar("--viz-grid", "#ecece7") },
          },
        },
      },
      plugins: [zonesPlugin as Plugin<"line">],
    });
    return () => chart.destroy();
  }, [puntos, umbrales, indice, theme]);

  return (
    <div className="grafica">
      <canvas ref={canvas} role="img" aria-label={`Evolución del ${indice} de la parcela`} />
    </div>
  );
}

export function SeriesLegend() {
  return (
    <div className="leyenda-serie">
      <span>
        <i className="punto verde" />
        Normal
      </span>
      <span>
        <i className="punto amarillo" />
        Precaución
      </span>
      <span>
        <i className="punto rojo" />
        Alerta
      </span>
      <span>
        <i className="zona" />
        Fuera de la etapa de desarrollo (no genera alertas)
      </span>
      <span>Las fechas con nubes se descartan y no se grafican.</span>
    </div>
  );
}
