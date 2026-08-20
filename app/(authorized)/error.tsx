"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/app/_components/design-system/button";
import { EmptyState } from "@/app/_components/design-system/empty-state";

export default function RouteError({ reset }: { reset: () => void }) {
  const t = useTranslations("errors");
  const common = useTranslations("common");
  return (
    <EmptyState
      icon={AlertTriangle}
      title={t("pageTitle")}
      description={t("unknown")}
      action={
        <Button variant="secondary" onClick={reset}>
          {common("tryAgain")}
        </Button>
      }
    />
  );
}
