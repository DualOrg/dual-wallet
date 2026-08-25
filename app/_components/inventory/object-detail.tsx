"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Info, MoreHorizontal, X, Zap } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { ModalDialog } from "@/app/_components/design-system/modal-dialog";
import { ObjectVisual } from "@/app/_components/inventory/object-visual";
import {
  shortId,
  type ObjectDetail as ObjectDetailModel,
} from "@/app/_domain/inventory";
import {
  ExternalFaceBridgeError,
  toAuthenticatedExternalFaceDetailContext,
  type ExternalFaceActionRequest,
  type ExternalFaceActionResult,
} from "@/app/_lib/external-face-bridge";
import {
  readExternalFaceAttributes,
  verifyExternalFaceAction,
} from "@/app/_services/external-face.client";

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
        // A scrollable region needs to be reachable by keyboard.
        <pre
          className="json-view"
          role="region"
          aria-label={title}
          tabIndex={0}
        >
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

export interface ObjectActionSlotContext {
  requestedAction?: ExternalFaceActionRequest;
  onRequestedActionCompleted?: (actionId: string) => void;
  onCancel?: () => void;
}

/**
 * The slot context reaches the actions panel through context rather than
 * cloneElement, so the panel keeps a stable identity and does not lose what the
 * user entered — or the completion it just reported — when the object refetches.
 */
const ObjectActionSlot = createContext<ObjectActionSlotContext>({});

export function useObjectActionSlot() {
  return useContext(ObjectActionSlot);
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
  const format = useFormatter();
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
  const pendingBridgeAction = useRef<
    | {
        resolve: (result: ExternalFaceActionResult) => void;
        reject: (error: Error) => void;
      }
    | undefined
  >(undefined);
  const [requestedAction, setRequestedAction] =
    useState<ExternalFaceActionRequest>();
  const date = (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeStyle: "short" });
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
  const canHandleBridgeActions = Boolean(actions);
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
          pendingBridgeAction.current = { resolve, reject };
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

  const completeBridgeAction = useCallback((actionId: string) => {
    pendingBridgeAction.current?.resolve({
      status: "completed",
      action_id: actionId,
    });
    pendingBridgeAction.current = undefined;
    actionInProgress.current = false;
    setRequestedAction(undefined);
    setModalView(null);
  }, []);

  const cancelBridgeAction = useCallback(() => {
    pendingBridgeAction.current?.reject(
      new ExternalFaceBridgeError(
        "user_cancelled",
        "The action request was cancelled.",
      ),
    );
    pendingBridgeAction.current = undefined;
    actionInProgress.current = false;
    setRequestedAction(undefined);
  }, []);

  const closeModal = useCallback(() => {
    if (modalView === "actions") cancelBridgeAction();
    setModalView(null);
  }, [cancelBridgeAction, modalView]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      moreButton.current?.focus();
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(
    () => () => {
      pendingBridgeAction.current?.reject(
        new ExternalFaceBridgeError(
          "bridge_closed",
          "The Viewer closed the action request.",
        ),
      );
    },
    [],
  );

  const slotContext = useMemo<ObjectActionSlotContext>(
    () => ({
      requestedAction,
      onRequestedActionCompleted: requestedAction
        ? completeBridgeAction
        : undefined,
      onCancel: closeModal,
    }),
    [closeModal, completeBridgeAction, requestedAction],
  );

  const showDetails = () => {
    setMenuOpen(false);
    setModalView("details");
  };

  return (
    <>
      <section className="wallet-object-view">
        <header className="wallet-object-identity">
          <h1>{item.name}</h1>
          <p>
            {item.category || t("smartObject")}
            {item.edition ? ` · #${item.edition}` : ""}
          </p>
        </header>
        <div className="wallet-pass-top-controls">
          {actions ? (
            <button
              ref={actionButton}
              type="button"
              className="wallet-pass-actions-button has-label"
              aria-label={t("showActions")}
              onClick={() => setModalView("actions")}
            >
              <Zap size={18} aria-hidden />
              {t("actions")}
            </button>
          ) : null}
          <div className="wallet-pass-menu" ref={menu}>
            <button
              ref={moreButton}
              type="button"
              className="wallet-pass-more"
              aria-label={t("moreOptions")}
              aria-expanded={menuOpen}
              aria-controls="object-options-popover"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={23} aria-hidden />
            </button>
            {menuOpen ? (
              <div
                id="object-options-popover"
                className="wallet-pass-menu-popover"
                aria-label={t("optionsMenu")}
                role="group"
              >
                <button type="button" onClick={showDetails}>
                  <Info size={18} aria-hidden />
                  {t("showDetails")}
                </button>
                {action ? (
                  <div className="wallet-pass-menu-action">{action}</div>
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
                    ? toAuthenticatedExternalFaceDetailContext(
                        item,
                        bridgeActions,
                        item.display?.config ?? null,
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
        <ModalDialog
          labelledBy="object-pass-detail-title"
          onClose={closeModal}
          initialFocusRef={closeButton}
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
                <ObjectActionSlot.Provider value={slotContext}>
                  {actions}
                </ObjectActionSlot.Provider>
              </section>
            )}
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}
