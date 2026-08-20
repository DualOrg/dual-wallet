"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthMethods } from "@/app/_components/auth/auth-methods";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";

export function LoginPageClient() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <>
      <p className="page-eyebrow">{t("eyebrow")}</p>
      <h1>{t("welcome")}</h1>
      <p className="auth-description">{t("welcomeDescription")}</p>
      <AuthMethods
        mode="login"
        emailPanel={(auth) => (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              auth.emailLogin(email, password);
            }}
          >
            <Field
              type="email"
              name="email"
              label={t("email")}
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
            <Field
              type="password"
              name="password"
              label={t("password")}
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <Link href="/forgot-password" className="text-link forgot-link">
              {t("forgotPassword")}
            </Link>
            <Button block type="submit" disabled={Boolean(auth.pending)}>
              {auth.pending === "email" ? (
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
              ) : null}
              {t(auth.pending === "email" ? "signingIn" : "signIn")}
            </Button>
          </form>
        )}
      />
      <p className="auth-links">
        {t("noAccount")}{" "}
        <Link className="text-link" href="/register">
          {t("registerLink")}
        </Link>
      </p>
    </>
  );
}
