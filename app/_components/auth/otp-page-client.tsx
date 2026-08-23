"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { Field } from "@/app/_components/design-system/field";
import { useAuthActions } from "@/app/_hooks/use-auth-actions";

// The sign-in mail carries a code to type and a link to follow. The link brings
// its own address, because it opens in whatever browser reads the mail — which
// is the situation this whole flow exists for, since the person cannot sign in
// the usual way.
export function OtpPageClient() {
  const t = useTranslations("otp");
  const auth = useTranslations("auth");
  const params = useSearchParams();
  const actions = useAuthActions();

  const linkCode = params.get("code");
  const linkEmail = params.get("email");
  const fromLink = Boolean(linkCode && linkEmail);

  const [email, setEmail] = useState(linkEmail ?? "");
  const [code, setCode] = useState(linkCode ?? "");

  // A link is followed, not submitted, so it signs in on arrival. The guard
  // keeps a re-render from spending the code twice — it is single use, and the
  // second attempt would report a failure for a link that had just worked.
  const submitted = useRef(false);
  useEffect(() => {
    if (!fromLink || submitted.current) return;
    submitted.current = true;
    actions.otpLogin(linkEmail!, linkCode!);
  }, [actions, fromLink, linkCode, linkEmail]);

  const pending = actions.pending !== null;
  const waiting = fromLink && !actions.error && pending;

  return (
    <>
      <p className="page-eyebrow">{auth("eyebrow")}</p>
      <h1>{t("title")}</h1>
      <p className="auth-description">
        {fromLink ? t("fromLink") : t("description")}
      </p>
      {actions.error ? <Alert takeFocus>{actions.error}</Alert> : null}
      {waiting ? (
        <p className="auth-description">
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
          {t("submitting")}
        </p>
      ) : null}
      <form
        className="auth-form"
        hidden={waiting}
        onSubmit={(event) => {
          event.preventDefault();
          actions.otpLogin(email, code);
        }}
      >
        <Field
          type="email"
          name="email"
          label={auth("email")}
          placeholder={auth("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
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
        <Link className="text-link auth-links" href="/login">
          {t("back")}
        </Link>
      </form>
    </>
  );
}
