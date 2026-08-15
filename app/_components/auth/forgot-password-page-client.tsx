"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import { useRequestPasswordReset } from "@/app/_hooks/use-account-mutations";

export function ForgotPasswordPageClient() {
  const t = useTranslations("recovery");
  const auth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const resetRequest = useRequestPasswordReset();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetRequest.mutate(email);
  };

  if (resetRequest.isSuccess)
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
      {resetRequest.error ? <Alert>{resetRequest.error.message}</Alert> : null}
      <form className="auth-form" onSubmit={submit}>
        <Field
          type="email"
          name="email"
          label={auth("email")}
          placeholder={auth("emailPlaceholder")}
          value={email}
          onChange={(event) => {
            resetRequest.reset();
            setEmail(event.target.value);
          }}
          required
          autoComplete="email"
        />
        <Button block type="submit" disabled={resetRequest.isPending}>
          {resetRequest.isPending ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : null}
          {t(resetRequest.isPending ? "sending" : "send")}
        </Button>
        <Link className="text-link auth-links" href="/login">
          {t("back")}
        </Link>
      </form>
    </>
  );
}
