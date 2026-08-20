"use client";

import { useRef } from "react";
import { ShieldCheck, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { StatusBadge } from "@/app/_components/activity/status-badge";
import { ModalDialog } from "@/app/_components/design-system/modal-dialog";
import type { ActivityEntry } from "@/app/_domain/inventory";

function DetailField({
  label,
  value,
}: {
  label: string;
  value?: string | number;
}) {
  if (value === undefined || value === "") return null;
  return (
    <div className="object-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
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
  const format = useFormatter();
  const closeButton = useRef<HTMLButtonElement>(null);

  if (!entry) return null;
  const detail = entry.detail;
  const versionLabel = detail.version === 1 ? t("version1") : t("version2");
  const formatDate = (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeStyle: "medium" });

  return (
    <ModalDialog
      labelledBy="activity-detail-title"
      onClose={onClose}
      initialFocusRef={closeButton}
    >
      <header className="object-pass-modal-header">
        <div>
          <p className="page-eyebrow">{t("eyebrow")}</p>
          <div className="activity-modal-title-row">
            <h2 id="activity-detail-title">{entry.name}</h2>
            <span className="activity-version-badge">{versionLabel}</span>
            <StatusBadge status={entry.status} />
          </div>
        </div>
        <button
          ref={closeButton}
          type="button"
          className="object-pass-modal-close"
          aria-label={t("close")}
          onClick={onClose}
        >
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="object-pass-modal-body">
        <section className="object-detail-section">
          <h3>{t("action")}</h3>
          <dl className="object-detail-list">
            <DetailField label={t("id")} value={detail.id} />
            <DetailField label={t("batchId")} value={detail.batchId} />
            <DetailField label={t("name")} value={detail.name} />
            <DetailField label={t("alias")} value={detail.alias} />
            <DetailField label={t("version")} value={versionLabel} />
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
            <DetailField label={t("accessType")} value={detail.access?.type} />
          </dl>
        </section>

        <section className="object-detail-section">
          <h3>{t("integrity")}</h3>
          <dl className="object-detail-list">
            <DetailField label={t("hash")} value={detail.hash} />
            <DetailField label={t("messageHash")} value={detail.messageHash} />
            <DetailField label={t("account")} value={detail.account} />
            <DetailField label={t("controller")} value={detail.controller} />
          </dl>
        </section>

        <section className="object-detail-section">
          <h3>{t("fees")}</h3>
          <dl className="object-detail-list">
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
            <DetailField label={t("totalFeeWei")} value={detail.totalFeeWei} />
          </dl>
        </section>

        <section className="object-detail-section">
          <h3>{t("parameters")}</h3>
          <dl className="object-detail-list">
            <DetailField label={t("parameterId")} value={detail.params.id} />
            <DetailField
              label={t("templateId")}
              value={detail.params.templateId}
            />
            <DetailField label={t("quantity")} value={detail.params.num} />
            <DetailField label={t("destination")} value={detail.params.to} />
            <DetailField label={t("dataHash")} value={detail.params.dataHash} />
          </dl>
        </section>

        <section className="object-detail-section">
          <h3>
            {t("affectedObjects", { count: detail.affectedObjects.length })}
          </h3>
          <div className="activity-affected-list">
            {detail.affectedObjects.map((object) => (
              <dl
                className="object-detail-list activity-affected-object"
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
          <section className="object-detail-section">
            <h3>{t("permit")}</h3>
            <dl className="object-detail-list">
              <DetailField
                label={t("commitment")}
                value={detail.permit.commitment}
              />
              <DetailField
                label={t("actionType")}
                value={detail.permit.actionType}
              />
              <DetailField label={t("nonce")} value={detail.permit.nonce} />
              <DetailField
                label={t("recipient")}
                value={detail.permit.recipient}
              />
              <DetailField
                label={t("deadline")}
                value={detail.permit.deadline}
              />
            </dl>
          </section>
        ) : null}
        {detail.access ? (
          <section className="object-detail-section">
            <h3>{t("access")}</h3>
            <dl className="object-detail-list">
              <DetailField label={t("accessType")} value={detail.access.type} />
            </dl>
          </section>
        ) : null}

        <p className="activity-detail-security-note">
          <ShieldCheck size={17} aria-hidden />
          {t("securityNote")}
        </p>
      </div>
    </ModalDialog>
  );
}
