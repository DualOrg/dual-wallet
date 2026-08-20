"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthMethods } from "@/app/_components/auth/auth-methods";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";

export function RegisterPageClient() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const confirmField = useRef<HTMLInputElement>(null);
  return (
    <>
      <p className="page-eyebrow">{t("eyebrow")}</p>
      <h1>{t("create")}</h1>
      <p className="auth-description">{t("createDescription")}</p>
      <AuthMethods
        mode="register"
        emailPanel={(auth) => (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              const invalid = password !== confirm;
              setMismatch(invalid);
              // Failed submission keeps the values and lands on the field.
              if (invalid) confirmField.current?.focus();
              else auth.emailRegister(email, password, nickname);
            }}
          >
            <Field
              name="nickname"
              label={t("name")}
              placeholder={t("namePlaceholder")}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              autoComplete="nickname"
            />
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              autoComplete="new-password"
              required
            />
            <Field
              ref={confirmField}
              type="password"
              name="confirm"
              label={t("confirmPassword")}
              value={confirm}
              error={mismatch ? t("passwordMismatch") : undefined}
              onChange={(event) => {
                setMismatch(false);
                setConfirm(event.target.value);
              }}
              minLength={8}
              autoComplete="new-password"
              required
            />
            <Button block type="submit" disabled={Boolean(auth.pending)}>
              {auth.pending === "email" ? (
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
              ) : null}
              {t(
                auth.pending === "email" ? "creatingAccount" : "createAccount",
              )}
            </Button>
          </form>
        )}
      />
      <p className="auth-links">
        {t("hasAccount")}{" "}
        <Link className="text-link" href="/login">
          {t("loginLink")}
        </Link>
      </p>
    </>
  );
}
