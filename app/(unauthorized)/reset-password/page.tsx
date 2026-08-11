"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import { requestJson } from "@/app/_utils/client-api";

function ResetForm() {
  const t = useTranslations("recovery");
  const auth = useTranslations("auth");
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setPending(true);
    setError(null);
    try {
      await requestJson("/api/session/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setUpdated(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  };

  if (updated)
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
      {error ? <Alert>{error}</Alert> : null}
      <form className="auth-form" onSubmit={submit}>
        <Field
          type="password"
          name="password"
          label={t("newPassword")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
        />
        <Field
          type="password"
          name="confirm"
          label={t("confirm")}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
        />
        <Button block type="submit" disabled={pending || !token}>
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
          {t(pending ? "updating" : "update")}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
