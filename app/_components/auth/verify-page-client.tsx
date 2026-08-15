"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import {
  useRequestVerificationCode,
  useVerifyAccount,
} from "@/app/_hooks/use-account-mutations";
import { useSession } from "@/app/_providers/session-provider";

export function VerifyPageClient() {
  const t = useTranslations("verify");
  const auth = useTranslations("auth");
  const session = useSession();
  const [code, setCode] = useState("");
  const verification = useVerifyAccount();
  const resendCode = useRequestVerificationCode();
  const pending = verification.isPending || resendCode.isPending;
  const error = verification.error ?? resendCode.error;

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
      <p className="auth-description">{t("description")}</p>
      {error ? <Alert>{error.message}</Alert> : null}
      {resendCode.isSuccess ? (
        <Alert tone="success">{t("resent")}</Alert>
      ) : null}
      {verification.isSuccess ? (
        <Alert tone="success">
          <CheckCircle2 size={17} />
          {t("success")}
        </Alert>
      ) : null}
      <form className="auth-form" onSubmit={submit}>
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
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : null}
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
