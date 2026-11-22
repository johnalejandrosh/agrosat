import { RAMPA, gradienteRampa } from "@/lib/agro/colors";
import { num } from "@/lib/agro/format";
import type { Indice } from "@/lib/agro/status";

/** Leyenda de la escala de color del mapa (RF-06). */
export function IndexLegend({ indice }: { indice: Indice }) {
  const r = RAMPA[indice];
  return (
    <div className="leyenda">
      <div className="rampa">
        <span style={{ background: gradienteRampa(indice) }} />
        <div className="rampa-txt">
          <span>{num(r.min, 1)}</span>
          <span>
            {r.textoBajo} → {r.textoAlto}
          </span>
          <span>{num(r.max, 1)}</span>
        </div>
      </div>
      <span className="item">
        <i className="cuadro nube" />
        Nube o sombra (QA_PIXEL)
      </span>
      <span className="item">
        <i className="cuadro borde" />
        Borde = semáforo
      </span>
    </div>
  );
}
