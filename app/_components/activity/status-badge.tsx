import type { ActivityEntry } from "@/app/_domain/inventory";

export function StatusBadge({ status }: { status: ActivityEntry["status"] }) {
  return <span className={`status status-${status}`}>{status}</span>;
}
