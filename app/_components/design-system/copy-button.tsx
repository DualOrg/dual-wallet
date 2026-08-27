"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * An identifier rendered as a button that copies it to the clipboard. The
 * children carry the visible (possibly shortened) representation.
 */
export function CopyButton({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // ponytail: on clipboard denial the value stays visible to select by hand.
    }
  };

  return (
    <>
      <button type="button" className="copy-button" onClick={copy}>
        {children}
        {copied ? (
          <Check size={14} aria-hidden />
        ) : (
          <Copy size={14} aria-hidden />
        )}
        <span className="sr-only">{t("copy")}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}
