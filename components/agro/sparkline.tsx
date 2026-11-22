/** Mini serie del NDVI (SVG, sin dependencias). Escala fija 0,1–0,9 para comparar parcelas entre sí. */
export function Sparkline({ values, color, width = 96, height = 30 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = 0.1;
  const max = 0.9;
  const points = values
    .map((v, i) => {
      const x = 2 + (i / (values.length - 1)) * (width - 4);
      const y = height - 2 - Math.max(0, Math.min(1, (v - min) / (max - min))) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="chispa" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendencia del NDVI en las últimas imágenes">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
