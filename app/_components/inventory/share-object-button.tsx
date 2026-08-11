"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/app/_components/design-system/button";

export function ShareObjectButton({
  objectId,
  menuItem = false,
}: {
  objectId: string;
  menuItem?: boolean;
}) {
  const t = useTranslations("object");
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = new URL(
      `/objects/${encodeURIComponent(objectId)}`,
      window.location.origin,
    ).toString();

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="share-control">
      <Button
        type="button"
        variant="secondary"
        role={menuItem ? "menuitem" : undefined}
        onClick={share}
      >
        {status === "copied" ? (
          <Check size={17} aria-hidden />
        ) : (
          <Share2 size={17} aria-hidden />
        )}
        {t(
          status === "copied"
            ? "shared"
            : status === "failed"
              ? "shareFailedShort"
              : "share",
        )}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {status === "copied"
          ? t("sharedStatus")
          : status === "failed"
            ? t("shareFailed")
            : ""}
      </span>
    </div>
  );
}
