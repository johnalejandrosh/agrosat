"use client";

/** Control segmentado (pestañas compactas): índice NDVI/NDWI, rango de fechas, etc. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  small = false,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string])[];
  small?: boolean;
  label: string;
}) {
  return (
    <div className={`pestanas no-print ${small ? "chica" : ""}`} role="tablist" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? "activa" : ""} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const OPCIONES_INDICE = [
  ["NDVI", "Vigor (NDVI)"],
  ["NDWI", "Agua (NDWI)"],
] as const;
