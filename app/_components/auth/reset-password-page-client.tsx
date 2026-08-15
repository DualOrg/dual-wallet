"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import { useSetNewPassword } from "@/app/_hooks/use-account-mutations";

export function ResetPasswordPageClient({ token }: { token?: string }) {
  const t = useTranslations("recovery");
  const auth = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const passwordUpdate = useSetNewPassword();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError(auth("passwordMismatch"));
      return;
    }
    if (!token) {
      setError(t("missingToken"));
      return;
    }
    setError(null);
    passwordUpdate.mutate({ token, password });
  };

  if (passwordUpdate.isSuccess)
    return (
      <>
        <span className="method-icon">
          <CheckCircle2 size={27} />
        </span>
        <h1>{t("updatedTitle")}</h1>
        <p className="auth-description">{t("updatedDescription")}</p>
        <Link href="/login" className="button button-primary button-block">
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
        <Alert>{passwordUpdate.error.message}</Alert>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      <form className="auth-form" onSubmit={submit}>
        <Field
          type="password"
          name="password"
          label={t("newPassword")}
          value={password}
          onChange={(event) => {
            passwordUpdate.reset();
            setError(null);
            setPassword(event.target.value);
          }}
          minLength={8}
          required
          autoComplete="new-password"
        />
        <Field
          type="password"
          name="confirm"
          label={t("confirm")}
          value={confirm}
          onChange={(event) => {
            passwordUpdate.reset();
            setError(null);
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
            <LoaderCircle size={18} className="animate-spin" />
          ) : null}
          {t(passwordUpdate.isPending ? "updating" : "update")}
        </Button>
      </form>
    </>
  );
}
