"use client";

import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useFocusOnMount } from "@/app/_hooks/use-focus-on-mount";

const icons = { error: AlertCircle, success: CheckCircle2, info: Info };

export function Alert({
  children,
  tone = "error",
  takeFocus = false,
}: {
  children: React.ReactNode;
  tone?: "error" | "success" | "info";
  /** Send focus here when the alert appears, e.g. a failed submission. */
  takeFocus?: boolean;
}) {
  const Icon = icons[tone];
  const ref = useFocusOnMount<HTMLDivElement>(takeFocus);
  return (
    <div
      ref={ref}
      tabIndex={takeFocus ? -1 : undefined}
      className={`alert alert-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon size={17} aria-hidden />
      {children}
    </div>
  );
}
