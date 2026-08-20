"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button, buttonClass } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import { useSetNewPassword } from "@/app/_hooks/use-account-mutations";
import { useErrorMessage } from "@/app/_hooks/use-error-message";
import { useFocusOnMount } from "@/app/_hooks/use-focus-on-mount";

export function ResetPasswordPageClient({ token }: { token?: string }) {
  const t = useTranslations("recovery");
  const auth = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const confirmField = useRef<HTMLInputElement>(null);
  const errorMessage = useErrorMessage();
  const passwordUpdate = useSetNewPassword();
  const doneHeading = useFocusOnMount<HTMLHeadingElement>(
    passwordUpdate.isSuccess,
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const invalid = password !== confirm;
    setMismatch(invalid);
    if (invalid) {
      // Failed submission keeps the entered values and lands on the field.
      confirmField.current?.focus();
      return;
    }
    if (!token) return;
    passwordUpdate.mutate({ token, password });
  };

  if (passwordUpdate.isSuccess)
    return (
      <>
        <span className="method-icon">
          <CheckCircle2 size={27} aria-hidden />
        </span>
        <h1 ref={doneHeading} className="auth-result" tabIndex={-1}>
          {t("updatedTitle")}
        </h1>
        <p className="auth-description">{t("updatedDescription")}</p>
        <Link href="/login" className={buttonClass("primary", true)}>
          {auth("signIn")}
        </Link>
      </>
    );
  return (
    <>
      <p className="page-eyebrow">{auth("eyebrow")}</p>
      <h1>{t("newTitle")}</h1>
      <p className="auth-description">{t("newDescription")}</p>
      {!token ? <Alert>{t("missingToken")}</Alert> : null}
      {passwordUpdate.error ? (
        <Alert takeFocus>{errorMessage(passwordUpdate.error)}</Alert>
      ) : null}
      <form className="auth-form" onSubmit={submit}>
        <Field
          type="password"
          name="password"
          label={t("newPassword")}
          value={password}
          onChange={(event) => {
            passwordUpdate.reset();
            setMismatch(false);
            setPassword(event.target.value);
          }}
          minLength={8}
          required
          autoComplete="new-password"
        />
        <Field
          ref={confirmField}
          type="password"
          name="confirm"
          label={t("confirm")}
          value={confirm}
          error={mismatch ? auth("passwordMismatch") : undefined}
          onChange={(event) => {
            passwordUpdate.reset();
            setMismatch(false);
            setConfirm(event.target.value);
          }}
          minLength={8}
          required
          autoComplete="new-password"
        />
        <Button
          block
          type="submit"
          disabled={passwordUpdate.isPending || !token}
        >
          {passwordUpdate.isPending ? (
            <LoaderCircle size={18} className="animate-spin" aria-hidden />
          ) : null}
          {t(passwordUpdate.isPending ? "updating" : "update")}
        </Button>
        <Link className="text-link auth-links" href="/login">
          {t("back")}
        </Link>
      </form>
    </>
  );
}
