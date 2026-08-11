"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import { requestJson } from "@/app/_utils/client-api";

export default function ForgotPasswordPage() {
  const t = useTranslations("recovery");
  const auth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await requestJson("/api/session/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  };

  if (sent)
    return (
      <>
        <span className="method-icon">
          <MailCheck size={27} />
        </span>
        <h1>{t("sentTitle")}</h1>
        <p className="auth-description">{t("sentDescription")}</p>
        <Link href="/login" className="button button-secondary button-block">
          <ArrowLeft size={18} />
          {t("back")}
        </Link>
      </>
    );
  return (
    <>
      <p className="page-eyebrow">{auth("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p className="auth-description">{t("description")}</p>
      {error ? <Alert>{error}</Alert> : null}
      <form className="auth-form" onSubmit={submit}>
        <Field
          type="email"
          name="email"
          label={auth("email")}
          placeholder={auth("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
        <Button block type="submit" disabled={pending}>
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
          {t(pending ? "sending" : "send")}
        </Button>
        <Link className="text-link auth-links" href="/login">
          {t("back")}
        </Link>
      </form>
    </>
  );
}
