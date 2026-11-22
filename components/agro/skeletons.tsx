/** Esqueletos de carga (renderizables en servidor) mientras llegan los datos de la sesión. */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando…" className="placeholder-glow">
      <div className="mb-4">
        <span className="placeholder col-3 mb-2" style={{ height: "1.9rem" }} />
        <br />
        <span className="placeholder col-4" />
      </div>
      <span className="placeholder w-100 rounded mb-3" style={{ height: "2.75rem" }} />
      <div className="resumen-semaforo">
        {Array.from({ length: cards }, (_, i) => (
          <span key={i} className="placeholder rounded" style={{ height: "4.5rem" }} />
        ))}
      </div>
      <div className="grid2">
        <span className="placeholder rounded" style={{ height: "16rem" }} />
        <span className="placeholder rounded" style={{ height: "16rem" }} />
      </div>
    </div>
  );
}

export function CardsSkeleton() {
  return (
    <div className="tarjetas placeholder-glow" aria-busy="true" aria-label="Cargando…">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="placeholder rounded" style={{ height: "11rem" }} />
      ))}
    </div>
  );
}
