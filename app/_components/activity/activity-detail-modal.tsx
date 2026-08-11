"use client";

import { useEffect, useRef } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/app/_components/activity/status-badge";
import type { ActivityEntry } from "@/app/_domain/inventory";

function JsonData({ value }: { value: object }) {
  return (
    <pre className="activity-detail-json">{JSON.stringify(value, null, 2)}</pre>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | number;
}) {
  if (value === undefined || value === "") return null;
  return (
    <div className="activity-detail-field">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

export function ActivityDetailModal({
  entry,
  onClose,
}: {
  entry: ActivityEntry | null;
  onClose: () => void;
}) {
  const t = useTranslations("activity.details");
  const locale = useLocale();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!entry) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [entry, onClose]);

  if (!entry) return null;
  const detail = entry.detail;
  const formatDate = (value: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(value);

  return (
    <div
      className="activity-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="card activity-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-detail-title"
      >
        <header className="activity-modal-header">
          <div>
            <p className="page-eyebrow">{t("eyebrow")}</p>
            <div className="activity-modal-title-row">
              <h2 id="activity-detail-title">{entry.name}</h2>
              <StatusBadge status={entry.status} />
            </div>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="activity-modal-close"
            aria-label={t("close")}
            onClick={onClose}
          >
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="activity-modal-body">
          <section className="activity-detail-section">
            <h3>{t("action")}</h3>
            <dl className="activity-detail-grid">
              <DetailField label={t("id")} value={detail.id} />
              <DetailField label={t("batchId")} value={detail.batchId} />
              <DetailField label={t("name")} value={detail.name} />
              <DetailField label={t("alias")} value={detail.alias} />
              <DetailField label={t("version")} value={detail.version} />
              <DetailField label={t("nonce")} value={detail.nonce} />
              <DetailField
                label={t("created")}
                value={formatDate(detail.whenCreated)}
              />
              <DetailField
                label={t("modified")}
                value={formatDate(detail.whenModified)}
              />
              <DetailField
                label={t("authentication")}
                value={detail.authenticationType}
              />
              <DetailField
                label={t("accessType")}
                value={detail.access?.type}
              />
            </dl>
          </section>

          <section className="activity-detail-section">
            <h3>{t("integrity")}</h3>
            <dl className="activity-detail-grid activity-detail-grid-wide">
              <DetailField label={t("hash")} value={detail.hash} />
              <DetailField
                label={t("messageHash")}
                value={detail.messageHash}
              />
              <DetailField label={t("signer")} value={detail.signer} />
              <DetailField
                label={t("delegatedSigner")}
                value={detail.delegatedSigner}
              />
            </dl>
          </section>

          <section className="activity-detail-section">
            <h3>{t("fees")}</h3>
            <dl className="activity-detail-grid">
              <DetailField label={t("baseFee")} value={detail.baseFee} />
              <DetailField label={t("baseFeeWei")} value={detail.baseFeeWei} />
              <DetailField label={t("dynamicFee")} value={detail.dynamicFee} />
              <DetailField
                label={t("dynamicFeeWei")}
                value={detail.dynamicFeeWei}
              />
              <DetailField
                label={t("additionalFee")}
                value={detail.additionalFee}
              />
              <DetailField
                label={t("additionalFeeWei")}
                value={detail.additionalFeeWei}
              />
              <DetailField label={t("tokenPrice")} value={detail.tokenPrice} />
              <DetailField label={t("totalFee")} value={detail.totalFee} />
              <DetailField
                label={t("totalFeeWei")}
                value={detail.totalFeeWei}
              />
            </dl>
          </section>

          <section className="activity-detail-section">
            <h3>{t("parameters")}</h3>
            <JsonData value={detail.params} />
          </section>

          <section className="activity-detail-section">
            <h3>
              {t("affectedObjects", { count: detail.affectedObjects.length })}
            </h3>
            <div className="activity-affected-list">
              {detail.affectedObjects.map((object) => (
                <dl
                  className="activity-detail-grid"
                  key={`${object.id}-${object.stateChangeId}`}
                >
                  <DetailField label={t("objectId")} value={object.id} />
                  <DetailField
                    label={t("templateId")}
                    value={object.templateId}
                  />
                  <DetailField
                    label={t("changeType")}
                    value={object.changeType}
                  />
                  <DetailField
                    label={t("stateChangeId")}
                    value={object.stateChangeId}
                  />
                  <DetailField
                    label={t("previousStateHash")}
                    value={object.prevStateHash}
                  />
                  <DetailField
                    label={t("nextStateHash")}
                    value={object.nextStateHash}
                  />
                  <DetailField
                    label={t("previousIntegrityHash")}
                    value={object.prevIntegrityHash}
                  />
                  <DetailField
                    label={t("integrityHash")}
                    value={object.integrityHash}
                  />
                </dl>
              ))}
            </div>
          </section>

          {detail.permit ? (
            <section className="activity-detail-section">
              <h3>{t("permit")}</h3>
              <JsonData value={detail.permit} />
            </section>
          ) : null}
          {detail.access ? (
            <section className="activity-detail-section">
              <h3>{t("access")}</h3>
              <JsonData value={detail.access} />
            </section>
          ) : null}

          <p className="activity-detail-security-note">
            <ShieldCheck size={17} aria-hidden />
            {t("securityNote")}
          </p>
        </div>
      </section>
    </div>
  );
}
