"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Platform } from "@/api/platform";

const PLATFORMS: Platform[] = ["production", "sandbox"];

// Each option is a full page load with `?platform=`: the proxy stores the
// choice, and the server-rendered banner and every cached query start fresh.
export function PlatformSelector({
  platform,
  sandboxAvailable,
}: {
  platform: Platform;
  sandboxAvailable: boolean;
}) {
  const t = useTranslations("platform");
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = (
    <>
      <span className={`platform-dot platform-dot-${platform}`} aria-hidden />
      <span className="platform-name">
        <small>{t("title")}</small>
        {t(platform)}
      </span>
    </>
  );

  if (!sandboxAvailable) {
    return (
      <span
        className={`platform-chip platform-${platform}`}
        aria-label={t("label", { platform: t(platform) })}
      >
        {current}
      </span>
    );
  }

  return (
    <div className="platform-selector" ref={container}>
      <button
        ref={trigger}
        className={`platform-chip platform-${platform}`}
        type="button"
        aria-label={t("label", { platform: t(platform) })}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {current}
        <ChevronsUpDown size={16} aria-hidden />
      </button>

      {open ? (
        <div id={menuId} className="platform-menu">
          <ul>
            {PLATFORMS.map((option) => (
              <li key={option}>
                <a
                  href={`?platform=${option}`}
                  aria-current={option === platform ? "true" : undefined}
                >
                  <span
                    className={`platform-dot platform-dot-${option}`}
                    aria-hidden
                  />
                  {t(option)}
                  {option === platform ? <Check size={16} aria-hidden /> : null}
                </a>
              </li>
            ))}
          </ul>
          <p>{t("hint")}</p>
        </div>
      ) : null}
    </div>
  );
}
