import Link from "next/link";
import { ChevronRight, PackageCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { productFaceEntries } from "@/api/product-face-registry";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import { PageHeader } from "@/app/_components/design-system/page-header";

// Programme entry: no object is selected or owned yet. The list comes from
// the server-only registry, never from object data or the URL.
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const t = await getTranslations("products");
  const entries = productFaceEntries();
  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      {entries.length ? (
        <ul className="product-programme-list">
          {entries.map((entry) => (
            <li key={entry.slug}>
              <Link
                className="card product-programme-link"
                href={`/products/${entry.slug}`}
                aria-label={t("open", { programme: entry.programmeName })}
              >
                <span className="product-programme-icon" aria-hidden>
                  <PackageCheck size={22} />
                </span>
                <span className="product-programme-copy">
                  <strong>{entry.programmeName}</strong>
                  <span>{t("publisher", { publisher: entry.publisher })}</span>
                </span>
                <ChevronRight size={20} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={PackageCheck}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      )}
    </>
  );
}
