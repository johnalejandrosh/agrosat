import type { ReactNode } from "react";
import { NIVEL_TXT, type Nivel } from "@/lib/agro/status";

/** Punto de color del semáforo (renderizable en servidor y cliente). */
export function Punto({ nivel, grande = false, label }: { nivel: Nivel | null; grande?: boolean; label?: string }) {
  return (
    <span
      className={`punto ${nivel ?? ""} ${grande ? "grande" : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export function ChipNivel({ nivel, children }: { nivel: Nivel | null; children?: ReactNode }) {
  return <span className={`chip ${nivel ?? ""}`}>{children ?? (nivel ? NIVEL_TXT[nivel] : "Sin datos")}</span>;
}

export function LeyendaSemaforo() {
  return (
    <div className="leyenda-semaforo">
      <span>
        <Punto nivel="verde" />
        Verde: el cultivo está normal
      </span>
      <span>
        <Punto nivel="amarillo" />
        Amarillo: revise pronto
      </span>
      <span>
        <Punto nivel="rojo" />
        Rojo: actúe lo antes posible
      </span>
    </div>
  );
}

/** Encabezado de página con acciones a la derecha (patrón de la plantilla). */
export function PageHead({ eyebrow, title, subtitle, children }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-0">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="text-body-secondary mb-0">{subtitle}</p>}
      </div>
      {children && <div className="page-head__actions no-print">{children}</div>}
    </header>
  );
}
