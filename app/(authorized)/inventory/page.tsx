"use client";

import { useDeferredValue, useState } from "react";
import { AlertTriangle, LoaderCircle, PackageOpen, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/app/_components/design-system/button";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import { PageHeader } from "@/app/_components/design-system/page-header";
import { ObjectCard } from "@/app/_components/inventory/object-card";
import { useInventory } from "@/app/_hooks/data";
import { useSession } from "@/app/_providers/session-provider";

export default function InventoryPage() {
  const t = useTranslations("inventory");
  const common = useTranslations("common");
  const { wallet } = useSession();
  const [search, setSearch] = useState("");
  const query = useInventory(useDeferredValue(search), wallet?.address);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={18} aria-hidden />
          <label className="sr-only" htmlFor="inventory-search">
            {t("search")}
          </label>
          <input
            id="inventory-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </div>
      </div>
      {query.isPending ? (
        <div className="inventory-grid">
          <div className="card skeleton" />
          <div className="card skeleton" />
          <div className="card skeleton" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("errorTitle")}
          description={query.error.message}
          action={
            <Button variant="secondary" onClick={() => query.refetch()}>
              {common("tryAgain")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <>
          <div className="inventory-grid">
            {items.map((item) => (
              <ObjectCard item={item} key={item.id} />
            ))}
          </div>
          {query.hasNextPage ? (
            <div className="load-more">
              <Button
                variant="secondary"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : null}
                {t(query.isFetchingNextPage ? "loadingMore" : "loadMore")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
