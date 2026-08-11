import Link from "next/link";
import { Zap } from "lucide-react";
import type { InventoryObject } from "@/app/_domain/inventory";
import { shortId } from "@/app/_domain/inventory";
import { ObjectVisual } from "@/app/_components/inventory/object-visual";
import { isInventoryActionName } from "@/app/_lib/inventory-actions";

export function ObjectCard({ item }: { item: InventoryObject }) {
  const actionCount = item.actions.filter(isInventoryActionName).length;
  const actionLabel = `${actionCount} ${actionCount === 1 ? "action" : "actions"} available`;
  return (
    <Link
      className={`card object-card ${item.display ? "has-display" : "is-metadata"}`}
      href={`/inventory/${encodeURIComponent(item.id)}`}
      aria-label={`Open ${item.name}`}
    >
      <ObjectVisual
        url={item.imageUrl}
        display={item.display}
        name={item.name}
      />
      <div className="object-body">
        <div className="object-card-meta">
          <p className="object-category">
            {item.category || "Smart object"}
            {item.edition ? ` · #${item.edition}` : ""}
          </p>
          {actionCount ? (
            <span
              className="object-card-action-indicator"
              role="img"
              aria-label={actionLabel}
              title={actionLabel}
            >
              <Zap size={15} aria-hidden />
            </span>
          ) : null}
        </div>
        <h2 className="object-title">{item.name}</h2>
        <p className="object-description">
          {item.description || "Verified digital object"}
        </p>
        <div className="mono-row">
          <span>Object ID</span>
          <span className="mono">{shortId(item.id)}</span>
        </div>
      </div>
    </Link>
  );
}
