"use client";

import { useDeferredValue, useState } from "react";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/app/_components/design-system/button";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import { PageHeader } from "@/app/_components/design-system/page-header";
import { ActivityDetailModal } from "@/app/_components/activity/activity-detail-modal";
import { StatusBadge } from "@/app/_components/activity/status-badge";
import { shortId, type ActivityEntry } from "@/app/_domain/inventory";
import { useActivity } from "@/app/_hooks/data";
import { useSession } from "@/app/_providers/session-provider";

function date(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default function ActivityPage() {
  const t = useTranslations("activity");
  const common = useTranslations("common");
  const { wallet } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>(
    [undefined],
  );
  const cursor = cursorHistory[cursorHistory.length - 1];
  const query = useActivity(
    useDeferredValue(search),
    status,
    wallet?.id,
    cursor,
  );
  const items = query.data?.items ?? [];
  const nextCursor = query.data?.next;
  const hasPreviousPage = cursorHistory.length > 1;
  const hasNextPage = Boolean(nextCursor && nextCursor !== cursor);

  const resetPaging = () => {
    setCursorHistory([undefined]);
    setSelected(null);
  };

  const previousPage = () => {
    setCursorHistory((current) =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
    setSelected(null);
  };

  const nextPage = () => {
    if (!nextCursor || nextCursor === cursor) return;
    setCursorHistory((current) => [...current, nextCursor]);
    setSelected(null);
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
          <Search size={18} />
          <label className="sr-only" htmlFor="activity-search">
            {t("search")}
          </label>
          <input
            id="activity-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPaging();
            }}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <label className="sr-only" htmlFor="activity-status">
          {t("status")}
        </label>
        <select
          id="activity-status"
          className="input"
          style={{ width: 190 }}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            resetPaging();
          }}
        >
          <option value="">{t("allStatuses")}</option>
          <option value="pending">{t("pending")}</option>
          <option value="completed">{t("completed")}</option>
          <option value="failed">{t("failed")}</option>
        </select>
      </div>
      {query.isPending ? (
        <div className="card skeleton" />
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
          icon={ActivityIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <>
          <div className="card activity-list">
            {items.map((item) => (
              <button
                type="button"
                className="activity-item"
                key={item.id}
                aria-haspopup="dialog"
                aria-label={t("openDetails", { name: item.name })}
                onClick={() => setSelected(item)}
              >
                <span className="activity-symbol">
                  <Boxes size={20} />
                </span>
                <div className="activity-main">
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
                    <span className="mono" title={item.hash}>
                      {shortId(item.hash)}
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
        </>
      )}
      {!query.isPending &&
      !query.isError &&
      (hasPreviousPage || hasNextPage) ? (
        <nav className="activity-pagination" aria-label={t("pagination")}>
          <Button
            variant="secondary"
            disabled={!hasPreviousPage || query.isFetching}
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
