import Link from "next/link";
import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { InventoryObject } from "@/app/_domain/inventory";
import { shortId } from "@/app/_domain/inventory";
import { ObjectVisual } from "@/app/_components/inventory/object-visual";
import { isInventoryActionName } from "@/app/_services/inventory-actions";
import { toInventoryCardExternalFaceContext } from "@/app/_lib/external-face-bridge";

export function ObjectCard({
  item,
  bridgeEnabled = false,
}: {
  item: InventoryObject;
  bridgeEnabled?: boolean;
}) {
  const t = useTranslations("inventory");
  const actionCount = item.actions.filter(isInventoryActionName).length;
  const actionLabel = t("actionsAvailable", { count: actionCount });
  return (
    <Link
      className={`card object-card ${item.display ? "has-display" : "is-metadata"}`}
      href={`/inventory/${encodeURIComponent(item.id)}`}
      aria-label={t("openNamed", { name: item.name })}
    >
      <ObjectVisual
        url={item.imageUrl}
        display={item.display}
        name={item.name}
        allowInteraction={false}
        bridgeContext={
          bridgeEnabled ? toInventoryCardExternalFaceContext(item) : undefined
        }
      />
      <div className="object-body">
        <div className="object-card-meta">
          <p className="object-category">
            {item.category || t("smartObject")}
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
          {item.description || t("verifiedObject")}
        </p>
        <div className="mono-row">
          <span>{t("objectId")}</span>
          <span className="mono">{shortId(item.id)}</span>
        </div>
      </div>
    </Link>
  );
}
