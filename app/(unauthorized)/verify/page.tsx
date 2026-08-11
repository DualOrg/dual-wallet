"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import { useSession } from "@/app/_providers/session-provider";
import { requestJson } from "@/app/_utils/client-api";

export default function VerifyPage() {
  const t = useTranslations("verify");
  const auth = useTranslations("auth");
  const router = useRouter();
  const session = useSession();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await requestJson("/api/session/verify", {
        method: "POST",
        body: JSON.stringify({ code, email: session.wallet?.email }),
      });
      setSuccess(true);
      await session.refresh();
      setTimeout(() => router.replace("/inventory"), 700);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  };
  const resend = async () => {
    setPending(true);
    setError(null);
    try {
      await requestJson("/api/session/verification-code", {
        method: "POST",
        body: "{}",
      });
      setResent(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <p className="page-eyebrow">{auth("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p className="auth-description">{t("description")}</p>
      {error ? <Alert>{error}</Alert> : null}
      {resent ? <Alert tone="success">{t("resent")}</Alert> : null}
      {success ? (
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
        <Button block type="submit" disabled={pending || success}>
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
