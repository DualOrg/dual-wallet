import { useTranslations } from "next-intl";
import type { ActivityEntry } from "@/app/_domain/inventory";

export function StatusBadge({ status }: { status: ActivityEntry["status"] }) {
  const t = useTranslations("activity");
  return <span className={`status status-${status}`}>{t(status)}</span>;
}
