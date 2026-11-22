import Link from "next/link";
import { Icon as CIcon } from "@/components/agro/icon";
import { cilEnvelopeClosed } from "@coreui/icons";
import { fecha } from "@/lib/agro/format";
import type { AlertItem as Alert } from "@/lib/server/parcel-queries";
import { Punto } from "./semaforo";

const ENVIO: Record<NonNullable<Alert["emailStatus"]>, (a: Alert) => string> = {
  SENT: (a) => `Enviada por correo el ${fecha(a.emailedAt!)}`,
  LOGGED: () => "Correo registrado (el servidor de correo no está configurado)",
  SKIPPED: () => "Detectada en el histórico: no se envió correo",
  FAILED: () => "No se pudo enviar el correo",
};

/** Alerta temprana con su mensaje sencillo, estado y el correo enviado (RF-09, RF-10). */
export function AlertItem({ a, compacta = false, sinParcela = false, conProductor = false }: { a: Alert; compacta?: boolean; sinParcela?: boolean; conProductor?: boolean }) {
  return (
    <article className="alerta">
      <Punto nivel={a.nivel} />
      <div className="alerta-cuerpo">
        <div className="alerta-cab">
          <strong>{a.titulo}</strong>
          {!sinParcela && (
            <span>
              · <Link href={`/dashboard/parcelas/${a.parcelId}`}>{a.parcelName}</Link>
              {conProductor && <span className="text-body-secondary"> · {a.ownerName}</span>}
            </span>
          )}
          <span className="text-body-secondary fecha">Imagen del {fecha(a.openedAt)}</span>
        </div>
        <p>{a.texto}</p>
        <div className="alerta-pie">
          {a.emailStatus && (
            <span>
              <CIcon icon={cilEnvelopeClosed} size="sm" /> {ENVIO[a.emailStatus](a)}
            </span>
          )}
          {a.status === "ACTIVE" ? (
            <span className={`chip ${a.nivel}`}>Activa</span>
          ) : (
            <span>· Cerrada el {fecha(a.closedAt!)} (el cultivo volvió a la normalidad)</span>
          )}
        </div>
        {!compacta && (
          <details>
            <summary>Ver el correo</summary>
            <pre className="correo">{`Para: ${a.email.to}\nAsunto: ${a.email.subject}\n\n${a.email.text}`}</pre>
          </details>
        )}
      </div>
    </article>
  );
}
