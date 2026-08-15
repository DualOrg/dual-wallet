"use client";

import { useDeferredValue, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  LayoutGrid,
  List,
  LoaderCircle,
  PackageOpen,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/app/_components/design-system/button";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import { PageHeader } from "@/app/_components/design-system/page-header";
import { ObjectCard } from "@/app/_components/inventory/object-card";
import { useInventory } from "@/app/_hooks/data";
import { useSession } from "@/app/_providers/session-provider";

type InventoryView = "grid" | "list";

const inventoryViewKey = "viewer-inventory-view";
const inventoryViewEvent = "viewer-inventory-view-change";

function subscribeToInventoryView(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === inventoryViewKey) callback();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(inventoryViewEvent, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(inventoryViewEvent, callback);
  };
}

function getInventoryView(): InventoryView {
  return localStorage.getItem(inventoryViewKey) === "list" ? "list" : "grid";
}

function getServerInventoryView(): InventoryView {
  return "grid";
}

function setInventoryView(view: InventoryView) {
  localStorage.setItem(inventoryViewKey, view);
  window.dispatchEvent(new Event(inventoryViewEvent));
}

export function InventoryPageClient() {
  const t = useTranslations("inventory");
  const common = useTranslations("common");
  const { wallet, isAuthenticated } = useSession();
  const [search, setSearch] = useState("");
  const view = useSyncExternalStore(
    subscribeToInventoryView,
    getInventoryView,
    getServerInventoryView,
  );
  const query = useInventory(useDeferredValue(search), wallet?.account.address);
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
        <div
          className="inventory-view-switch"
          role="group"
          aria-label={t("viewMode")}
        >
          <button
            className="inventory-view-option"
            type="button"
            aria-pressed={view === "grid"}
            onClick={() => setInventoryView("grid")}
          >
            <LayoutGrid size={17} aria-hidden />
            {t("gridView")}
          </button>
          <button
            className="inventory-view-option"
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setInventoryView("list")}
          >
            <List size={17} aria-hidden />
            {t("listView")}
          </button>
        </div>
      </div>
      {query.isPending ? (
        <div className={`inventory-grid is-${view}`}>
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
          <div className={`inventory-grid is-${view}`}>
            {items.map((item) => (
              <ObjectCard
                item={item}
                key={item.id}
                bridgeEnabled={isAuthenticated}
              />
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
