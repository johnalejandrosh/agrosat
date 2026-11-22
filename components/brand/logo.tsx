type LogoProps = {
  /** Tamaño del isotipo en px. */
  size?: number;
  /** Muestra el nombre junto al isotipo. */
  withWordmark?: boolean;
  /** Clases extra para el nombre (p. ej. helpers del sidebar contraído). */
  wordmarkClassName?: string;
  /** Variante para el panel de marca (sobre el degradado del tema). */
  inverted?: boolean;
};

/**
 * Isotipo de AgroSat: una hoja con su nervadura y la órbita de un satélite.
 * Toma sus colores del tema activo (--app-logo-*); en SVG van como `style`
 * porque los atributos de presentación no aceptan var().
 */
export function Logo({ size = 32, withWordmark = true, wordmarkClassName = "", inverted = false }: LogoProps) {
  const stroke = inverted ? "var(--app-logo-inverted-stroke)" : "var(--app-logo-stroke)";
  return (
    <>
      <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="agrosat-logo-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--app-logo-from)" }} />
            <stop offset="1" style={{ stopColor: "var(--app-logo-to)" }} />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" style={{ fill: inverted ? "var(--app-logo-inverted-bg)" : "url(#agrosat-logo-gradient)" }} />
        {/* Hoja */}
        <path d="M9 23c0-8.5 5.3-13.6 14.5-14.5C22.6 17.7 17.5 23 9 23z" fill="none" strokeWidth="2.2" strokeLinejoin="round" style={{ stroke }} />
        <path d="M9 23l7.5-7.5" fill="none" strokeWidth="2.2" strokeLinecap="round" style={{ stroke }} />
        {/* Satélite en órbita */}
        <circle cx="24.5" cy="24.5" r="2.3" style={{ fill: inverted ? "var(--app-accent)" : "var(--app-logo-dot)" }} />
      </svg>
      {withWordmark && (
        <span className={`brand-wordmark ${wordmarkClassName}`}>
          Agro<span style={inverted ? { color: "var(--app-aside-wordmark)" } : undefined}>Sat</span>
        </span>
      )}
    </>
  );
}
