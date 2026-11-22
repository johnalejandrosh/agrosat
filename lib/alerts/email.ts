/**
 * Envío de alertas por correo electrónico (RF-09).
 * Con SMTP_HOST configurado se envía con nodemailer; sin SMTP, el correo queda registrado
 * (estado LOGGED) y se puede ver completo en la plataforma.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { fecha, satelite } from "@/lib/agro/format";
import { NIVEL_TXT, mensajeAlerta, tituloAlerta, type Indice, type Nivel } from "@/lib/agro/status";

export type AlertEmailInput = {
  to: string;
  ownerName: string;
  parcelName: string;
  cropName: string;
  parcelUrl: string | null;
  nivel: Exclude<Nivel, "verde">;
  indice: Indice;
  valor: number;
  umbral: number;
  imageDate: Date;
  platform: string;
};

export function alertEmail(input: AlertEmailInput) {
  const nombre = input.ownerName.split(/\s+/)[0] || input.ownerName;
  const subject = `AgroSat · ${NIVEL_TXT[input.nivel]} en su parcela ${input.parcelName}`;
  const text = [
    `Hola, ${nombre}:`,
    "",
    `La imagen ${satelite(input.platform)} del ${fecha(input.imageDate)} muestra un cambio en su parcela ${input.parcelName} (${input.cropName}).`,
    "",
    `${tituloAlerta(input.indice, input.nivel)}. ${mensajeAlerta(input)}`,
    "",
    input.parcelUrl ? `Puede ver el mapa y la evolución del cultivo en AgroSat: ${input.parcelUrl}` : "Puede ver el mapa y la evolución del cultivo en AgroSat.",
    "",
    "Este aviso es automático y se basa en imágenes satelitales; no reemplaza la visita al lote.",
  ].join("\n");
  return { to: input.to, subject, text };
}

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    transporter = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
  });
  return transporter;
}

export const smtpConfigured = () => Boolean(process.env.SMTP_HOST?.trim());

export type DeliveryResult = { status: "SENT" | "LOGGED" | "FAILED"; error?: string };

export async function deliverEmail(message: { to: string; subject: string; text: string }): Promise<DeliveryResult> {
  const t = getTransporter();
  if (!t) {
    console.info(`[AgroSat] Correo registrado (SMTP sin configurar) → ${message.to}: ${message.subject}`);
    return { status: "LOGGED" };
  }
  try {
    await t.sendMail({ from: process.env.SMTP_FROM?.trim() || "AgroSat <no-responder@agrosat.local>", ...message });
    return { status: "SENT" };
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 480) : "Error desconocido" };
  }
}
