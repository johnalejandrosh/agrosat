"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CContainer, CHeader, CHeaderToggler } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilBell, cilMenu, cilPlus } from "@coreui/icons";
import { Logo } from "@/components/brand/logo";
import { useSession } from "@/components/providers/session-provider";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ThemeSwitcher } from "./theme-switcher";

export function AppHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const headerRef = useRef<HTMLDivElement>(null);
  const { user, can } = useSession();

  // Sombra suave cuando el contenido pasa por debajo del header.
  useEffect(() => {
    const onScroll = () => {
      headerRef.current?.classList.toggle("shadow-sm", document.documentElement.scrollTop > 0);
    };
    document.addEventListener("scroll", onScroll, { passive: true });
    return () => document.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <CHeader position="sticky" className="app-header p-0 no-print" ref={headerRef}>
      <CContainer className="px-3 px-lg-4 gap-2 gap-md-3 flex-nowrap" fluid>
        <CHeaderToggler onClick={onToggleSidebar} className="px-2" aria-label="Mostrar u ocultar menú">
          <CIcon icon={cilMenu} size="lg" />
        </CHeaderToggler>

        <Link href="/dashboard" className="d-lg-none me-auto" aria-label="AgroSat, ir al inicio">
          <Logo size={30} withWordmark={false} />
        </Link>

        <span className="header-context d-none d-md-inline me-auto">Monitoreo con Landsat 8 y 9 · Sabana Centro</span>

        {can(PERMISSIONS.PARCELS_CREATE) && (
          <Link href="/dashboard/parcelas/nueva" className="btn btn-primary btn-sm d-none d-sm-inline-flex align-items-center gap-2">
            <CIcon icon={cilPlus} />
            Registrar parcela
          </Link>
        )}
        {can(PERMISSIONS.ALERTS_READ) && (
          <Link
            href="/dashboard/alertas"
            className="icon-btn"
            aria-label={user.activeAlerts ? `Alertas: ${user.activeAlerts} activas` : "Alertas"}
            title={user.activeAlerts ? `${user.activeAlerts} alertas activas` : "Sin alertas activas"}
          >
            <CIcon icon={cilBell} />
            {user.activeAlerts > 0 && <span className="icon-btn__dot" aria-hidden="true" />}
          </Link>
        )}
        <ThemeSwitcher />
      </CContainer>
    </CHeader>
  );
}
