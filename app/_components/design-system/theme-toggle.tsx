"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/app/_providers/theme-provider";

export function ThemeToggle() {
  const t = useTranslations("common");
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className="icon-button"
      type="button"
      aria-label={t("theme")}
      title={t("theme")}
      onClick={toggleTheme}
    >
      {theme === "dark" ? (
        <Sun size={19} aria-hidden />
      ) : (
        <Moon size={19} aria-hidden />
      )}
    </button>
  );
}
