"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import {
  useRequestVerificationCode,
  useVerifyAccount,
} from "@/app/_hooks/use-account-mutations";
import { useErrorMessage } from "@/app/_hooks/use-error-message";
import { useSession } from "@/app/_providers/session-provider";

export function VerifyPageClient() {
  const t = useTranslations("verify");
  const auth = useTranslations("auth");
  const session = useSession();
  const errorMessage = useErrorMessage();
  const params = useSearchParams();
  const verification = useVerifyAccount();
  const resendCode = useRequestVerificationCode();

  // The mail carries both a code to type and a link to follow. The link brings
  // its own address and organization because it opens in whatever browser reads
  // the mail, which is usually not the one holding a session.
  const linkCode = params.get("code");
  const linkEmail = params.get("email") ?? undefined;
  const linkOrganizationId = params.get("organization_id") ?? undefined;
  const fromLink = Boolean(linkCode && linkEmail);

  const [code, setCode] = useState(linkCode ?? "");
  const pending = verification.isPending || resendCode.isPending;
  const error = verification.error ?? resendCode.error;

  // A link is followed, not submitted, so it verifies on arrival. The guard
  // keeps a re-render from spending the code a second time — it is single use,
  // and the second attempt would report a failure for a link that worked.
  const submitted = useRef(false);
  useEffect(() => {
    if (!fromLink || submitted.current) return;
    submitted.current = true;
    verification.mutate({
      code: linkCode!,
      email: linkEmail,
      organization_id: linkOrganizationId,
    });
  }, [fromLink, linkCode, linkEmail, linkOrganizationId, verification]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    verification.mutate({ code, email: session.wallet?.email });
  };
  const resend = () => {
    verification.reset();
    resendCode.mutate();
  };

  return (
    <>
      <p className="page-eyebrow">{auth("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p className="auth-description">
        {fromLink ? t("fromLink") : t("description")}
      </p>
      {error ? <Alert takeFocus>{errorMessage(error)}</Alert> : null}
      {resendCode.isSuccess ? (
        <Alert tone="success">{t("resent")}</Alert>
      ) : null}
      {verification.isSuccess ? (
        <Alert tone="success">
          <CheckCircle2 size={17} aria-hidden />
          {t("success")}
        </Alert>
      ) : null}
      {fromLink && !verification.isSuccess && !error ? (
        <p className="auth-description">
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
          {t("submitting")}
        </p>
      ) : null}
      <form className="auth-form" onSubmit={submit} hidden={fromLink && !error}>
        <Field
          name="code"
          label={t("code")}
          value={code}
          onChange={(event) => setCode(event.target.value.trim())}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
        <Button block type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle size={18} className="animate-spin" aria-hidden />
          ) : null}
          {t(pending ? "submitting" : "submit")}
        </Button>
        <Button
          block
          variant="secondary"
          type="button"
          disabled={pending}
          onClick={resend}
        >
          {t("resend")}
        </Button>
      </form>
    </>
  );
}
