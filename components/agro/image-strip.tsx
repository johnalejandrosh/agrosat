import { Icon as CIcon } from "@/components/agro/icon";
import { cilSatelite } from "@coreui/icons";
import { fecha, num, satelite } from "@/lib/agro/format";
import type { ImageInfo } from "@/lib/server/parcel-queries";

/** Franja con la última imagen válida y la próxima pasada estimada de Landsat. */
export function ImageStrip({ info }: { info: ImageInfo }) {
  return (
    <div className="franja">
      <CIcon icon={cilSatelite} />
      {info.ultima ? (
        <span>
          Última imagen útil: <b>{fecha(info.ultima.acquiredAt)}</b> · {satelite(info.ultima.platform)}
          {info.ultima.cloudCover !== null && <> · nubes en la escena {num(info.ultima.cloudCover, 0)} %</>}
        </span>
      ) : (
        <span>Todavía no hay imágenes útiles (sin nubes) para estas parcelas.</span>
      )}
      {info.proxima && (
        <span className="sep">
          Próxima pasada: <b>≈ {fecha(info.proxima.acquiredAt)}</b> · {satelite(info.proxima.platform)}
        </span>
      )}
    </div>
  );
}
