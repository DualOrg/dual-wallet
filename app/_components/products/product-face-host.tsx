"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { Button } from "@/app/_components/design-system/button";
import { ProductFaceConfirmationDialog } from "@/app/_components/products/product-face-confirmation";
import {
  newFaceLaunchId,
  ProductFaceError,
  type ProductFaceApplication,
  type SessionEndReason,
} from "@/app/_domain/product-face";
import { productFaceContextQueryOptions } from "@/app/_hooks/query-options";
import { useProductFaceHost } from "@/app/_hooks/use-product-face-host";
import { useSession } from "@/app/_providers/session-provider";

// No popups, downloads, top navigation or device permissions. The frame is
// a cross-origin first-party reviewed application on its own origin.
const PRODUCT_FACE_SANDBOX = "allow-scripts allow-same-origin allow-forms";

const knownErrors = [
  "artifact_mismatch",
  "artifact_unavailable",
  "unknown_application",
  "session_expired",
] as const;

function IdentityBar({
  application,
}: {
  application?: ProductFaceApplication;
}) {
  const t = useTranslations("products");
  return (
    <header className="product-face-identity" aria-label={t("identityLabel")}>
      <Link href="/products" className="product-face-back">
        <ArrowLeft size={18} aria-hidden />
        <span>{t("back")}</span>
      </Link>
      {application ? (
        <div className="product-face-identity-copy">
          <h1>{application.programme.name}</h1>
          <p>
            <ShieldCheck size={14} aria-hidden />
            <span>{t("publisher", { publisher: application.publisher })}</span>
          </p>
        </div>
      ) : null}
    </header>
  );
}

function ProductFaceFrame({
  slug,
  launchId,
  application,
  frameUrl,
  onEnded,
}: {
  slug: string;
  launchId: string;
  application: ProductFaceApplication;
  frameUrl: string;
  onEnded: (reason: SessionEndReason) => void;
}) {
  const t = useTranslations("products");
  const { wallet } = useSession();
  const {
    state,
    confirmation,
    answerConfirmation,
    onFrameLoad,
    notice,
    dismissNotice,
  } = useProductFaceHost({ slug, launchId, application, frameUrl, onEnded });

  if (state.status === "ended") return null;

  return (
    <>
      {notice ? (
        <div className="product-face-notice" role="status">
          <Alert tone="info">
            {t(`notices.${notice.kind}.${notice.reason}`, {
              publisher: application.publisher,
            })}
          </Alert>
          <Button variant="secondary" onClick={dismissNotice}>
            {t("notices.dismiss")}
          </Button>
        </div>
      ) : null}
      {state.status === "loading" ? (
        <p className="product-face-status" role="status">
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
          {t("loading")}
        </p>
      ) : null}
      <iframe
        className="product-face-frame"
        src={frameUrl}
        title={t("frameTitle", { programme: application.programme.name })}
        sandbox={PRODUCT_FACE_SANDBOX}
        allow=""
        referrerPolicy="no-referrer"
        onLoad={(event) => onFrameLoad(event.currentTarget)}
      />
      {confirmation && wallet ? (
        <ProductFaceConfirmationDialog
          request={confirmation}
          application={application}
          walletAddress={wallet.account.address}
          onAnswer={answerConfirmation}
        />
      ) : null}
    </>
  );
}

// Every frame is its own launch: a fresh launch id keys its own journal and
// selection on the server, so two tabs never overwrite each other.
type HostPhase =
  | { status: "open"; instance: number; launchId: string }
  | {
      status: "ended";
      instance: number;
      launchId: string;
      reason: SessionEndReason;
    };

/** Full-size host for one programme's reviewed product application. */
export function ProductFaceHost({ slug }: { slug: string }) {
  const t = useTranslations("products");
  const { wallet, isAuthenticated } = useSession();
  const [phase, setPhase] = useState<HostPhase>(() => ({
    status: "open",
    instance: 0,
    launchId: newFaceLaunchId(),
  }));
  const context = useQuery(
    productFaceContextQueryOptions(
      slug,
      phase.launchId,
      Boolean(wallet) && phase.status === "open",
    ),
  );
  const errorCode =
    context.error instanceof ProductFaceError ? context.error.code : undefined;

  return (
    <section className="product-face-shell">
      <IdentityBar application={context.data?.application} />
      <div className="product-face-stage">
        {phase.status === "ended" ? (
          <div className="product-face-ended">
            <Alert tone="info">{t(`ended.${phase.reason}`)}</Alert>
            {isAuthenticated && phase.reason === "account_changed" ? (
              <Button
                variant="secondary"
                onClick={() =>
                  setPhase({
                    status: "open",
                    instance: phase.instance + 1,
                    launchId: newFaceLaunchId(),
                  })
                }
              >
                {t("ended.reopen")}
              </Button>
            ) : null}
          </div>
        ) : context.data ? (
          <ProductFaceFrame
            key={phase.instance}
            slug={slug}
            launchId={phase.launchId}
            application={context.data.application}
            frameUrl={context.data.frameUrl}
            onEnded={(reason) =>
              setPhase((current) => ({
                status: "ended",
                instance: current.instance,
                launchId: current.launchId,
                reason,
              }))
            }
          />
        ) : context.isError ? (
          <Alert>
            {knownErrors.includes(errorCode as (typeof knownErrors)[number])
              ? t(`errors.${errorCode as (typeof knownErrors)[number]}`)
              : t("errors.generic")}
          </Alert>
        ) : (
          <p className="product-face-status" role="status">
            <LoaderCircle size={18} className="animate-spin" aria-hidden />
            {t("loading")}
          </p>
        )}
      </div>
    </section>
  );
}
