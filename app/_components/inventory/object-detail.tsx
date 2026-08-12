"use client";

import type { ReactElement, ReactNode } from "react";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Info, MoreHorizontal, X, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ObjectVisual } from "@/app/_components/inventory/object-visual";
import {
  shortId,
  type ObjectDetail as ObjectDetailModel,
} from "@/app/_domain/inventory";
import {
  ExternalFaceBridgeError,
  toAuthenticatedExternalFaceContext,
  type ExternalFaceActionRequest,
  type ExternalFaceActionResult,
} from "@/app/_lib/external-face-bridge";
import {
  readExternalFaceAttributes,
  verifyExternalFaceAction,
} from "@/app/_lib/external-face-data";

function displayKey(value: string) {
  const words = value.replaceAll("_", " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function detailValue(value: unknown) {
  return typeof value === "string" ? value : safeJson(value);
}

function DataSection({
  title,
  values,
  empty,
}: {
  title: string;
  values: Array<[string, unknown]>;
  empty?: string;
}) {
  return (
    <section className="object-detail-section">
      <h3>{title}</h3>
      {values.length ? (
        <dl className="object-detail-list">
          {values.map(([label, value]) => {
            const rendered = detailValue(value);
            return (
              <div className="object-detail-row" key={label}>
                <dt>{label}</dt>
                <dd title={rendered}>{rendered}</dd>
              </div>
            );
          })}
        </dl>
      ) : empty ? (
        <p className="object-detail-empty">{empty}</p>
      ) : null}
    </section>
  );
}

function CustomJsonSection({
  title,
  value,
  empty,
}: {
  title: string;
  value?: object;
  empty: string;
}) {
  const hasData = value && Object.keys(value).length > 0;
  return (
    <section className="object-detail-section">
      <h3>{title}</h3>
      {hasData ? (
        <pre className="json-view" aria-label={title}>
          {safeJson(value)}
        </pre>
      ) : (
        <p className="object-detail-empty">{empty}</p>
      )}
    </section>
  );
}

function StandardObjectFace({ item }: { item: ObjectDetailModel }) {
  const t = useTranslations("object");
  const common = useTranslations("common");

  return (
    <article className="wallet-standard-face">
      <div className="wallet-standard-art" aria-hidden={!item.imageUrl}>
        <ObjectVisual url={item.imageUrl} name={item.name} eager />
      </div>
      <div className="wallet-standard-copy">
        <p className="wallet-standard-category">
          {item.category || t("smartObject")}
        </p>
        <h2>{item.name}</h2>
        <p className="wallet-standard-description">
          {item.description || common("notAvailable")}
        </p>
        <p className="wallet-standard-id">{shortId(item.id, 6)}</p>
      </div>
    </article>
  );
}

interface ObjectActionSlotContext {
  requestedAction?: ExternalFaceActionRequest;
  onRequestedActionCompleted?: (actionId: string) => void;
}

export function ObjectDetail({
  item,
  action,
  actions,
  bridgeEnabled = false,
  bridgeActions = [],
}: {
  item: ObjectDetailModel;
  action?: ReactNode;
  actions?: ReactNode;
  bridgeEnabled?: boolean;
  bridgeActions?: string[];
}) {
  const locale = useLocale();
  const t = useTranslations("object");
  const common = useTranslations("common");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalView, setModalView] = useState<"details" | "actions" | null>(
    null,
  );
  const menu = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const actionInProgress = useRef(false);
  const [pendingBridgeAction, setPendingBridgeAction] = useState<
    | {
        resolve: (result: ExternalFaceActionResult) => void;
        reject: (error: Error) => void;
      }
    | undefined
  >(undefined);
  const [requestedAction, setRequestedAction] =
    useState<ExternalFaceActionRequest>();
  const date = (value: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  const metadata: Array<[string, unknown]> = [
    [t("name"), item.name],
    [t("descriptionLabel"), item.description || common("notAvailable")],
    [t("category"), item.category || common("notAvailable")],
    [
      t("edition"),
      item.edition !== undefined ? `#${item.edition}` : common("notAvailable"),
    ],
  ];
  const objectInformation: Array<[string, unknown]> = [
    [t("owner"), item.owner],
    [t("version"), item.version],
    [t("created"), date(item.createdAt)],
    [t("modified"), date(item.modifiedAt)],
    [t("stateHash"), item.stateHash],
    [t("contentHash"), item.contentHash],
    [t("templateId"), item.templateId],
  ];
  const system = Object.entries(item.system ?? {}).map(
    ([key, value]) => [displayKey(key), value] as [string, unknown],
  );
  const passAspectRatio = item.display?.aspectRatio
    ? item.display.aspectRatio.replace("/", " / ")
    : "4 / 3";
  const hasInlineHtmlDisplay =
    item.display?.kind === "document" &&
    item.display.mediaType.toLowerCase().startsWith("text/html");
  const canHandleBridgeActions =
    isValidElement(actions) && typeof actions.type !== "string";
  const readBridgeAttributes = useCallback(
    () => readExternalFaceAttributes(item.id),
    [item.id],
  );

  const requestBridgeAction = useCallback(
    async (request: ExternalFaceActionRequest) => {
      if (actionInProgress.current) {
        throw new ExternalFaceBridgeError(
          "action_in_progress",
          "Another action request is already awaiting confirmation.",
        );
      }
      actionInProgress.current = true;
      try {
        await verifyExternalFaceAction(item.id, request.name);
        return new Promise<ExternalFaceActionResult>((resolve, reject) => {
          setPendingBridgeAction({ resolve, reject });
          setRequestedAction(request);
          setMenuOpen(false);
          setModalView("actions");
        });
      } catch (error) {
        actionInProgress.current = false;
        throw error;
      }
    },
    [item.id],
  );

  const completeBridgeAction = useCallback(
    (actionId: string) => {
      pendingBridgeAction?.resolve({
        status: "completed",
        action_id: actionId,
      });
      setPendingBridgeAction(undefined);
      setRequestedAction(undefined);
      setModalView(null);
    },
    [pendingBridgeAction],
  );

  const renderedActions = canHandleBridgeActions
    ? cloneElement(actions as ReactElement<ObjectActionSlotContext>, {
        requestedAction,
        onRequestedActionCompleted: requestedAction
          ? completeBridgeAction
          : undefined,
      })
    : actions;

  const cancelBridgeAction = useCallback(() => {
    pendingBridgeAction?.reject(
      new ExternalFaceBridgeError(
        "user_cancelled",
        "The action request was cancelled.",
      ),
    );
    setPendingBridgeAction(undefined);
    setRequestedAction(undefined);
  }, [pendingBridgeAction]);

  const closeModal = useCallback(() => {
    if (modalView === "actions") cancelBridgeAction();
    setModalView(null);
  }, [cancelBridgeAction, modalView]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [menuOpen]);

  useEffect(() => {
    if (!modalView) return;
    const trigger =
      modalView === "actions" ? actionButton.current : moreButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [closeModal, modalView]);

  useEffect(
    () => () => {
      pendingBridgeAction?.reject(
        new ExternalFaceBridgeError(
          "bridge_closed",
          "The Viewer closed the action request.",
        ),
      );
    },
    [pendingBridgeAction],
  );

  useEffect(() => {
    if (!pendingBridgeAction && !requestedAction) {
      actionInProgress.current = false;
    }
  }, [pendingBridgeAction, requestedAction]);

  const showDetails = () => {
    setMenuOpen(false);
    setModalView("details");
  };

  return (
    <>
      <section className="wallet-object-view">
        <h1 className="sr-only">{item.name}</h1>
        <div className="wallet-pass-top-controls">
          {actions ? (
            <button
              ref={actionButton}
              type="button"
              className="wallet-pass-actions-button"
              aria-label={t("showActions")}
              onClick={() => setModalView("actions")}
            >
              <Zap size={18} aria-hidden />
            </button>
          ) : null}
          <div className="wallet-pass-menu" ref={menu}>
            <button
              ref={moreButton}
              type="button"
              className="wallet-pass-more"
              aria-label={t("moreOptions")}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={23} aria-hidden />
            </button>
            {menuOpen ? (
              <div className="wallet-pass-menu-popover" role="menu">
                <button type="button" role="menuitem" onClick={showDetails}>
                  <Info size={18} aria-hidden />
                  {t("showDetails")}
                </button>
                {action ? (
                  <div className="wallet-pass-menu-action" role="none">
                    {action}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="card wallet-pass-shell">
          <div
            className={`wallet-pass-stage${hasInlineHtmlDisplay ? " is-html-display" : ""}`}
            style={
              hasInlineHtmlDisplay
                ? undefined
                : { aspectRatio: passAspectRatio }
            }
          >
            {item.display ? (
              <ObjectVisual
                url={item.imageUrl}
                display={item.display}
                name={item.name}
                eager
                bridgeContext={
                  bridgeEnabled
                      ? toAuthenticatedExternalFaceContext(
                          item,
                          bridgeActions,
                          item.display?.config ?? null,
                          "detail",
                        )
                    : undefined
                }
                bridgeHandlers={{
                  openDetails: showDetails,
                  readAttributes: bridgeEnabled
                    ? readBridgeAttributes
                    : undefined,
                  requestAction:
                    bridgeEnabled && canHandleBridgeActions
                      ? requestBridgeAction
                      : undefined,
                }}
              />
            ) : (
              <StandardObjectFace item={item} />
            )}
          </div>
        </div>
      </section>

      {modalView ? (
        <div
          className="object-pass-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="card object-pass-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="object-pass-detail-title"
          >
            <header className="object-pass-modal-header">
              <div>
                <p className="page-eyebrow">
                  {t(modalView === "actions" ? "actions" : "details")}
                </p>
                <h2 id="object-pass-detail-title">{item.name}</h2>
              </div>
              <div className="object-pass-modal-actions">
                <button
                  ref={closeButton}
                  type="button"
                  className="object-pass-modal-close"
                  aria-label={t("closeDetails")}
                  onClick={closeModal}
                >
                  <X size={20} aria-hidden />
                </button>
              </div>
            </header>
            <div className="object-pass-modal-body">
              {modalView === "details" ? (
                <>
                  <DataSection title={t("metadata")} values={metadata} />
                  <CustomJsonSection
                    title={t("customData")}
                    value={item.custom}
                    empty={t("noCustomData")}
                  />
                  {system.length ? (
                    <DataSection title={t("systemData")} values={system} />
                  ) : null}
                  <DataSection
                    title={t("objectInformation")}
                    values={objectInformation}
                  />
                </>
              ) : (
                <section className="object-pass-detail-actions">
                  {renderedActions}
                </section>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
