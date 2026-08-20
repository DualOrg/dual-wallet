"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button, buttonClass } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import { useRequestPasswordReset } from "@/app/_hooks/use-account-mutations";
import { useErrorMessage } from "@/app/_hooks/use-error-message";
import { useFocusOnMount } from "@/app/_hooks/use-focus-on-mount";

export function ForgotPasswordPageClient() {
  const t = useTranslations("recovery");
  const auth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const errorMessage = useErrorMessage();
  const resetRequest = useRequestPasswordReset();
  const sentHeading = useFocusOnMount<HTMLHeadingElement>(
    resetRequest.isSuccess,
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetRequest.mutate(email);
  };

  if (resetRequest.isSuccess)
    return (
      <>
        <span className="method-icon">
          <MailCheck size={27} aria-hidden />
        </span>
        <h1 ref={sentHeading} className="auth-result" tabIndex={-1}>
          {t("sentTitle")}
        </h1>
        <p className="auth-description">{t("sentDescription")}</p>
        <Link href="/login" className={buttonClass("secondary", true)}>
          <ArrowLeft size={18} aria-hidden />
          {t("back")}
        </Link>
      </>
    );
  return (
    <>
      <p className="page-eyebrow">{auth("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p className="auth-description">{t("description")}</p>
      {resetRequest.error ? (
        <Alert takeFocus>{errorMessage(resetRequest.error)}</Alert>
      ) : null}
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
            <LoaderCircle size={18} className="animate-spin" aria-hidden />
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
