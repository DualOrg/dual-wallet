"use client";

import { useCallback, useId, useState } from "react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/app/_components/design-system/button";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import { PageHeader } from "@/app/_components/design-system/page-header";
import { Truncated } from "@/app/_components/design-system/truncated";
import { ActivityDetailModal } from "@/app/_components/activity/activity-detail-modal";
import { StatusBadge } from "@/app/_components/activity/status-badge";
import { shortId, type ActivityEntry } from "@/app/_domain/inventory";
import { useActivity } from "@/app/_hooks/data";
import { useErrorMessage } from "@/app/_hooks/use-error-message";
import { useDebouncedInput, useUrlFilters } from "@/app/_hooks/use-url-filters";
import { useSession } from "@/app/_providers/session-provider";

export function ActivityPageClient() {
  const t = useTranslations("activity");
  const common = useTranslations("common");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const rowId = useId();
  const { wallet } = useSession();
  const { filter, setFilters } = useUrlFilters();
  const search = filter("q");
  const status = filter("status");
  const cursor = filter("cursor") || undefined;
  const commitSearch = useCallback(
    // A new search restarts paging.
    (value: string) => setFilters({ q: value, cursor: undefined }),
    [setFilters],
  );
  const [searchDraft, setSearchDraft] = useDebouncedInput(search, commitSearch);
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const [previousCursors, setPreviousCursors] = useState<string[]>([]);
  const query = useActivity(search, status, wallet?.id, cursor);
  const items = query.data?.items ?? [];
  const nextCursor = query.data?.next;
  const hasNextPage = Boolean(nextCursor && nextCursor !== cursor);
  const date = (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeStyle: "short" });

  const previousPage = () => {
    const rest = previousCursors.slice(0, -1);
    setPreviousCursors(rest);
    setSelected(null);
    setFilters({ cursor: previousCursors.at(-1) });
  };

  const nextPage = () => {
    if (!nextCursor || nextCursor === cursor) return;
    setPreviousCursors((current) => [...current, cursor ?? ""]);
    setSelected(null);
    setFilters({ cursor: nextCursor });
  };
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
          <label className="sr-only" htmlFor="activity-search">
            {t("search")}
          </label>
          <input
            id="activity-search"
            className="input"
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <label className="sr-only" htmlFor="activity-status">
          {t("status")}
        </label>
        <select
          id="activity-status"
          className="input activity-status-filter"
          value={status}
          onChange={(event) => {
            setPreviousCursors([]);
            setSelected(null);
            setFilters({ status: event.target.value, cursor: undefined });
          }}
        >
          <option value="">{t("allStatuses")}</option>
          <option value="pending">{t("pending")}</option>
          <option value="completed">{t("completed")}</option>
          <option value="failed">{t("failed")}</option>
        </select>
      </div>
      <p className="sr-only" role="status">
        {query.isPending
          ? t("loadingActivity")
          : query.isError
            ? t("errorTitle")
            : t("resultCount", { count: items.length })}
      </p>
      {query.isPending ? (
        <div className="card skeleton" aria-busy aria-hidden />
      ) : query.isError ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("errorTitle")}
          description={errorMessage(query.error)}
          action={
            <Button variant="secondary" onClick={() => query.refetch()}>
              {common("tryAgain")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <div className="card activity-list">
          {items.map((item) => (
            <button
              type="button"
              className="activity-item"
              key={item.id}
              aria-haspopup="dialog"
              // Labelled by its own content, so status, date and fee are
              // announced instead of being masked by an aria-label.
              aria-labelledby={`${rowId}-${item.id}`}
              onClick={() => setSelected(item)}
            >
              <span className="activity-symbol">
                <Boxes size={20} aria-hidden />
              </span>
              <div className="activity-main" id={`${rowId}-${item.id}`}>
                <div className="activity-title-row">
                  <strong>{item.name}</strong>
                  <span className="activity-version-badge">
                    {t("versionBadge", { version: item.version })}
                  </span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="activity-meta">
                  <span>{date(item.createdAt)}</span>
                  <span>{t("affected", { count: item.affectedCount })}</span>
                  <span className="mono">
                    <Truncated value={item.hash} short={shortId(item.hash)} />
                  </span>
                </div>
              </div>
              <div className="activity-fee">
                {t("fee")}
                <strong>{item.totalFee || common("notAvailable")}</strong>
              </div>
            </button>
          ))}
        </div>
      )}
      {!query.isPending && !query.isError ? (
        <nav className="activity-pagination" aria-label={t("pagination")}>
          <Button
            variant="secondary"
            disabled={previousCursors.length === 0 || query.isFetching}
            onClick={previousPage}
          >
            <ChevronLeft size={17} aria-hidden />
            {t("previousPage")}
          </Button>
          <Button
            variant="secondary"
            disabled={!hasNextPage || query.isFetching}
            onClick={nextPage}
          >
            {t("nextPage")}
            <ChevronRight size={17} aria-hidden />
          </Button>
        </nav>
      ) : null}
      <ActivityDetailModal entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
