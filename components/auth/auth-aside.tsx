"use client";

import CIcon from "@coreui/icons-react";
import { cilBell, cilGlobeAlt, cilMap } from "@coreui/icons";
import { Logo } from "@/components/brand/logo";

const FEATURES = [
  { icon: cilMap, text: "Dibuje su lote en el mapa y AgroSat lo vigila" },
  { icon: cilGlobeAlt, text: "Imágenes gratuitas de Landsat 8 y 9 cada ~8 días" },
  { icon: cilBell, text: "Alertas tempranas por falta de agua o pérdida de vigor" },
];

/** Panel de marca de las pantallas de acceso (solo escritorio). */
export function AuthAside() {
  return (
    <aside className="auth-aside">
      <div className="d-flex align-items-center gap-2">
        <Logo size={36} inverted />
      </div>

      <div>
        <h2 className="auth-aside__title">Su cultivo, visto desde el espacio.</h2>
        <p className="auth-aside__lead mb-0">
          AgroSat convierte la reflectancia de las imágenes satelitales en un semáforo sencillo para que sepa qué lote necesita atención antes de que el daño se vea.
        </p>
        <ul className="auth-features">
          {FEATURES.map((feature) => (
            <li key={feature.text}>
              <span className="auth-features__icon">
                <CIcon icon={feature.icon} />
              </span>
              {feature.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Vista previa ilustrativa del semáforo (decorativa). */}
      <div className="auth-preview" aria-hidden="true">
        <div className="auth-preview__label">Vigor del cultivo (NDVI)</div>
        <div className="auth-preview__value">0,72 · Normal</div>
        <div className="auth-preview__bars">
          {[30, 44, 58, 70, 78, 74, 81].map((height, index) => (
            <span key={index} style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </aside>
  );
}
