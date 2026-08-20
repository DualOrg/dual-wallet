"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { buttonClass } from "@/app/_components/design-system/button";

export default function AuthError() {
  const t = useTranslations("errors");
  const auth = useTranslations("auth");
  return (
    <>
      <h1>{t("pageTitle")}</h1>
      <Alert>{t("unknown")}</Alert>
      <Link href="/login" className={buttonClass("secondary", true)}>
        {auth("signIn")}
      </Link>
    </>
  );
}
