import Link from "next/link";
import type { InventoryObject } from "@/app/_domain/inventory";
import { shortId } from "@/app/_domain/inventory";
import { ObjectVisual } from "@/app/_components/inventory/object-visual";

export function ObjectCard({ item }: { item: InventoryObject }) {
  return (
    <Link
      className="card object-card"
      href={`/inventory/${encodeURIComponent(item.id)}`}
      aria-label={`Open ${item.name}`}
    >
      <ObjectVisual url={item.imageUrl} name={item.name} />
      <div className="object-body">
        <p className="object-category">
          {item.category || "Smart object"}
          {item.edition ? ` · #${item.edition}` : ""}
        </p>
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
