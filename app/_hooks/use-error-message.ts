"use client";

import { useTranslations } from "next-intl";
import { ViewerError } from "@/app/_domain/errors";

/**
 * Maps a failure onto localized copy. Raw transport messages are never shown:
 * they are unlocalized and can leak backend detail.
 */
export function useErrorMessage() {
  const t = useTranslations("errors");
  return (error: unknown) =>
    error instanceof ViewerError ? t(error.category) : t("unknown");
}
