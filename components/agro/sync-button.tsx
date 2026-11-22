"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CButton, CSpinner } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilReload } from "@coreui/icons";
import { syncAllAction } from "@/app/(dashboard)/dashboard/procesamiento/actions";
import { useToast } from "@/components/providers/toast-provider";

export function SyncButton({ disabled }: { disabled: boolean }) {
  const notify = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <CButton
      color="primary"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncAllAction();
          notify(result.message ?? "", result.ok ? "success" : "danger");
          // La bitácora se actualiza a medida que avanza.
          if (result.ok) setTimeout(() => router.refresh(), 4000);
        })
      }
    >
      {pending ? <CSpinner size="sm" className="me-2" aria-hidden /> : <CIcon icon={cilReload} className="me-2" />}
      {disabled ? "Hay parcelas en proceso…" : "Sincronizar todas las parcelas"}
    </CButton>
  );
}
