"use client";

import { Suspense, useActionState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CAlert, CButton, CForm, CFormSwitch, CSpinner } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilBolt } from "@coreui/icons";
import { loginAction, type LoginState } from "@/app/(auth)/actions";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, SHOW_DEMO_LOGIN } from "@/lib/auth/demo";
import { FloatingField } from "./floating-field";
import { PasswordField } from "./password-field";

const initialState: LoginState = { email: "", remember: true, fieldErrors: {} };

/** Aviso cuando /api/auth/session-expired devuelve al login. */
function ExpiredNotice() {
  const params = useSearchParams();
  if (params.get("sesion") !== "expirada") return null;
  return (
    <CAlert color="warning" className="py-2 small">
      Su sesión expiró. Vuelva a iniciar sesión.
    </CAlert>
  );
}

export function LoginForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState(async (previous: LoginState, formData: FormData) => {
    // `?from=` lo agrega proxy.ts al bloquear una ruta privada; la acción lo valida.
    formData.set("from", new URLSearchParams(window.location.search).get("from") ?? "");
    return loginAction(previous, formData);
  }, initialState);

  /** Rellena una cuenta de demostración y envía el formulario. */
  function signInWithDemo(email: string) {
    if (!emailRef.current || !passwordRef.current) return;
    emailRef.current.value = email;
    passwordRef.current.value = DEMO_PASSWORD;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <p className="eyebrow mb-2">Acceso</p>
      <h1 className="h2 mb-2">Bienvenido a AgroSat</h1>
      <p className="text-body-secondary mb-4">Ingrese para ver el estado de sus parcelas.</p>

      {SHOW_DEMO_LOGIN && (
        <>
          <div className="demo-accounts" role="group" aria-label="Entrar con una cuenta de demostración">
            {DEMO_ACCOUNTS.map((account) => (
              <CButton
                key={account.email}
                type="button"
                color="secondary"
                variant="outline"
                className="demo-accounts__btn"
                onClick={() => signInWithDemo(account.email)}
                disabled={pending}
              >
                <CIcon icon={cilBolt} />
                <span>
                  <strong>{account.label}</strong>
                  <small>{account.detail}</small>
                </span>
              </CButton>
            ))}
          </div>
          <div className="auth-divider">o con su correo</div>
        </>
      )}

      <Suspense fallback={null}>
        <ExpiredNotice />
      </Suspense>

      <CForm ref={formRef} action={formAction} noValidate>
        {state.formError && (
          <CAlert color="danger" className="py-2 small" role="alert">
            {state.formError}
          </CAlert>
        )}

        <FloatingField
          ref={emailRef}
          id="login-email"
          name="email"
          type="email"
          label="Correo electrónico"
          autoComplete="email"
          defaultValue={state.email}
          error={state.fieldErrors.email}
          className="mb-3"
        />
        <PasswordField
          ref={passwordRef}
          id="login-password"
          name="password"
          label="Contraseña"
          autoComplete="current-password"
          error={state.fieldErrors.password}
          className="mb-3"
        />

        <div className="d-flex align-items-center justify-content-between mb-4">
          <CFormSwitch id="login-remember" name="remember" label="Recordarme" defaultChecked={state.remember} />
          <span className="small text-body-tertiary" title="Pida a un administrador que le asigne una contraseña nueva">
            ¿Olvidó su contraseña?
          </span>
        </div>

        <CButton type="submit" color="primary" size="lg" className="w-100" disabled={pending}>
          {pending && <CSpinner size="sm" className="me-2" aria-hidden />}
          {pending ? "Ingresando…" : "Iniciar sesión"}
        </CButton>
      </CForm>

      <p className="text-center text-body-secondary mt-4 mb-0">
        ¿Aún no tiene cuenta? <Link href="/register" className="fw-semibold">Regístrese</Link>
      </p>
    </>
  );
}
