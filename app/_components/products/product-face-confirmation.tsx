"use client";

import { useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/app/_components/design-system/button";
import { ModalDialog } from "@/app/_components/design-system/modal-dialog";
import {
  projectionFieldNames,
  type ProductFaceApplication,
  type ProductFaceConfirmation,
  type SettleFieldChange,
} from "@/app/_domain/product-face";
import { shortAccountAddress } from "@/app/_domain/wallet";
import { formatDecimalAmount } from "@/app/_utils/decimal";

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="object-detail-list">
      {rows.map(([label, value]) => (
        <div className="object-detail-row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SettleChanges({
  caption,
  changes,
}: {
  caption: string;
  changes: SettleFieldChange[];
}) {
  const t = useTranslations("products.confirm");
  const label = (field: string) => {
    const name = field.replace(/^(?:data\.)?custom\./, "");
    return (projectionFieldNames as readonly string[]).includes(name)
      ? t(`fields.${name as (typeof projectionFieldNames)[number]}`)
      : name;
  };
  return (
    <table className="product-face-changes">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{t("settle.field")}</th>
          <th scope="col">{t("settle.from")}</th>
          <th scope="col">{t("settle.to")}</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((change) => (
          <tr key={change.field}>
            <th scope="row">{label(change.field)}</th>
            <td>{change.from ?? t("settle.empty")}</td>
            <td>{change.to ?? t("settle.empty")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The wallet's own confirmation for a product-face request. Every value shown
 * is host-read (registry, canonical object, runtime facts read by the wallet)
 * or the user's own wallet; nothing is face-supplied text.
 */
export function ProductFaceConfirmationDialog({
  request,
  application,
  walletAddress,
  onAnswer,
}: {
  request: ProductFaceConfirmation;
  application: ProductFaceApplication;
  walletAddress: string;
  onAnswer: (confirmed: boolean) => void;
}) {
  const t = useTranslations("products.confirm");
  const locale = useLocale();
  const cancel = useRef<HTMLButtonElement>(null);

  let title: string;
  let description: string;
  let confirmLabel: string;
  let body: React.ReactNode;
  if (request.kind === "registration") {
    title = t("registration.title");
    description = t("registration.description");
    confirmLabel = t("registration.confirm");
    body = (
      <Facts
        rows={[
          [t("fields.name"), request.unit.name],
          ...projectionFieldNames
            .filter((field) => request.unit.fields[field])
            .map(
              (field) =>
                [t(`fields.${field}`), request.unit.fields[field]!] as [
                  string,
                  string,
                ],
            ),
        ]}
      />
    );
  } else if (request.kind === "runtime") {
    title = t("runtime.title");
    description = t("runtime.description");
    confirmLabel = t("runtime.confirm");
    body = (
      <>
        <Facts
          rows={[
            [
              t("runtime.operation"),
              // Message keys cannot contain dots; the operation name does.
              t(`runtime.operations.${request.operation.replaceAll(".", "_")}`),
            ],
            [t("product"), request.product.name],
            ...(request.caseId
              ? [[t("runtime.case"), request.caseId] as [string, string]]
              : []),
            ...(request.quote
              ? ([
                  [t("quote.provider"), request.quote.provider],
                  [
                    t("quote.amount"),
                    formatDecimalAmount(
                      request.quote.amount,
                      request.quote.currency,
                      locale,
                    ),
                  ],
                  [t("quote.version"), request.quote.quoteVersion],
                ] as Array<[string, string]>)
              : []),
          ]}
        />
        {request.operation === "case.quote.approve" ||
        request.operation === "case.quote.decline" ? (
          <p className="product-face-confirm-note">{t("noPayment")}</p>
        ) : null}
      </>
    );
  } else if (request.kind === "transfer") {
    // G8: the unit, that ownership moves, and the runtime-bound recipient
    // (read by the wallet itself) so an intercepted link is visible here.
    title = t(`transfer.${request.step}.title`);
    description = t(`transfer.${request.step}.description`);
    confirmLabel = t(`transfer.${request.step}.confirm`);
    body = (
      <>
        <Facts
          rows={[
            [t("product"), request.product.name],
            [t("transfer.recipient"), shortAccountAddress(request.recipient)],
          ]}
        />
        <p className="product-face-confirm-note">{t("transfer.check")}</p>
      </>
    );
  } else if (request.kind === "transfer_accept") {
    title = t("transferAccept.title");
    description = t("transferAccept.description");
    confirmLabel = t("transferAccept.confirm");
    body = null;
  } else {
    title = t("settle.title");
    description = t("settle.description");
    confirmLabel = t("settle.confirm");
    body = (
      <>
        <Facts rows={[[t("product"), request.product.name]]} />
        <SettleChanges
          caption={t("settle.changes")}
          changes={request.changes.filter((change) => change.kind === "value")}
        />
        {request.changes.some((change) => change.kind === "technical") ? (
          <details className="product-face-technical">
            <summary>
              {t("settle.technical", {
                count: request.changes.filter(
                  (change) => change.kind === "technical",
                ).length,
              })}
            </summary>
            <SettleChanges
              caption={t("settle.technicalCaption")}
              changes={request.changes.filter(
                (change) => change.kind === "technical",
              )}
            />
          </details>
        ) : null}
      </>
    );
  }

  return (
    <ModalDialog
      labelledBy="product-face-confirm-title"
      onClose={() => onAnswer(false)}
      initialFocusRef={cancel}
    >
      <header className="object-pass-modal-header">
        <div>
          <p className="page-eyebrow">
            <ShieldCheck size={15} aria-hidden />{" "}
            {t("requestedBy", {
              publisher: application.publisher,
              programme: application.programme.name,
            })}
          </p>
          <h2 id="product-face-confirm-title">{title}</h2>
        </div>
      </header>
      <div className="object-pass-modal-body">
        <p>{description}</p>
        {body}
        <Facts rows={[[t("yourWallet"), shortAccountAddress(walletAddress)]]} />
        <div className="product-face-confirm-actions">
          <Button
            ref={cancel}
            variant="secondary"
            onClick={() => onAnswer(false)}
          >
            {t("cancel")}
          </Button>
          <Button onClick={() => onAnswer(true)}>{confirmLabel}</Button>
        </div>
      </div>
    </ModalDialog>
  );
}
