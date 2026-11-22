"use server";

import { redirect } from "next/navigation";
import { HOME_PATH, LOGIN_PATH, safeRedirectPath } from "@/lib/auth/constants";
import { DEFAULT_ROLE_NAME } from "@/lib/auth/permissions";
import { hasErrors, validateLogin, validateRegister, type FieldErrors } from "@/lib/auth/validation";
import { db } from "@/lib/server/db";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/server/password";
import { createSession, deleteCurrentSession } from "@/lib/server/session";

export type LoginState = {
  email: string;
  remember: boolean;
  fieldErrors: FieldErrors<"email" | "password">;
  formError?: string;
};

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const from = String(formData.get("from") ?? "");

  const fieldErrors = validateLogin({ email, password });
  if (hasErrors(fieldErrors)) {
    return { email, remember, fieldErrors };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, active: true },
  });
  // Se compara siempre (con un hash de relleno si el correo no existe) para no revelar cuentas.
  const validPassword = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !validPassword) {
    return { email, remember, fieldErrors: {}, formError: "Correo o contraseña incorrectos." };
  }
  if (!user.active) {
    return { email, remember, fieldErrors: {}, formError: "Su cuenta está desactivada. Comuníquese con un administrador." };
  }

  await createSession(user.id, { persistent: remember });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  redirect(safeRedirectPath(from));
}

type RegisterField = "name" | "email" | "phone" | "municipality" | "password" | "confirmPassword" | "terms";

export type RegisterState = {
  values: { name: string; email: string; phone: string; municipality: string; terms: boolean };
  fieldErrors: FieldErrors<RegisterField>;
  formError?: string;
};

export async function registerAction(_previous: RegisterState, formData: FormData): Promise<RegisterState> {
  const input = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim(),
    municipality: String(formData.get("municipality") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    terms: formData.get("terms") === "on",
  };
  const values = { name: input.name, email: input.email, phone: input.phone, municipality: input.municipality, terms: input.terms };

  const fieldErrors = validateRegister(input);
  if (hasErrors(fieldErrors)) {
    return { values, fieldErrors };
  }

  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    return { values, fieldErrors: { email: "Ya existe una cuenta con este correo." } };
  }

  const role = await db.role.findUnique({ where: { name: DEFAULT_ROLE_NAME }, select: { id: true } });
  if (!role) {
    return { values, fieldErrors: {}, formError: `Falta el rol "${DEFAULT_ROLE_NAME}". Ejecuta \`npx prisma db seed\`.` };
  }

  const user = await db.user.create({
    data: {
      name: input.name.slice(0, 120),
      email: input.email,
      phone: input.phone.slice(0, 30),
      municipality: input.municipality.slice(0, 80),
      passwordHash: await hashPassword(input.password),
      roleId: role.id,
      // Autorización expresa del titular (Ley 1581 de 2012, RNF-05).
      dataConsentAt: new Date(),
      lastLoginAt: new Date(),
    },
    select: { id: true },
  });

  await createSession(user.id, { persistent: true });
  redirect(HOME_PATH);
}

export async function logoutAction() {
  await deleteCurrentSession();
  redirect(LOGIN_PATH);
}
