import type { Metadata } from "next";
import { Suspense } from "react";
import { NoAccess } from "@/components/admin/no-access";
import { AlertsView } from "@/components/agro/alerts-view";
import { PageHead } from "@/components/agro/semaforo";
import { smtpConfigured } from "@/lib/alerts/email";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/server/dal";
import { db } from "@/lib/server/db";
import { byAlertPriority, listAlerts } from "@/lib/server/parcel-queries";

export const metadata: Metadata = {
  title: "Alertas",
};

export default function AlertsPage() {
  return (
    <>
      <PageHead title="Alertas" subtitle="Se generan cuando el NDVI o el NDWI de una parcela bajan del umbral definido para su cultivo." />
      <Suspense fallback={<div className="placeholder-glow"><span className="placeholder rounded w-100" style={{ height: "20rem" }} /></div>}>
        <AlertsSection />
      </Suspense>
    </>
  );
}

async function AlertsSection() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.ALERTS_READ)) return <NoAccess permission={PERMISSIONS.ALERTS_READ} />;
  const [alerts, profile] = await Promise.all([
    listAlerts({ parcel: { ownerId: user.id } }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, phone: true, emailAlerts: true } }),
  ]);
  return (
    <AlertsView
      alerts={alerts.sort(byAlertPriority)}
      email={profile.email}
      phone={profile.phone}
      emailAlerts={profile.emailAlerts}
      smtp={smtpConfigured()}
    />
  );
}
