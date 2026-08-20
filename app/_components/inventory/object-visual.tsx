"use client";

import Image from "next/image";
import { Box } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ObjectPresentation } from "@/app/_domain/inventory";
import { cn } from "@/app/_utils/cn";
import {
  externalFaceBridgeApplication,
  startAuthenticatedExternalFaceBridge,
  type AuthenticatedExternalFaceContext,
  type ExternalFaceBridgeHandlers,
} from "@/app/_lib/external-face-bridge";

const DOCUMENT_POLICY = [
  "default-src 'none'",
  "img-src https: data:",
  "style-src 'unsafe-inline'",
  "font-src https: data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

// allow-popups lets a face offer an outbound link; without it both window.open
// and target="_blank" are silently inert. The escape variant keeps the opened
// tab from inheriting this sandbox. Neither grants authority over this page:
// the frame is already cross-origin and already scripts, and
// allow-top-navigation stays absent, so a face can open a new top-level
// context but never navigate ours.
const EXTERNAL_DOCUMENT_SANDBOX =
  "allow-forms allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox";

function sandboxedDocument(source: string) {
  return `<meta http-equiv="Content-Security-Policy" content="${DOCUMENT_POLICY}">${source}`;
}

export function ObjectVisual({
  url,
  display,
  name,
  eager = false,
  bridgeContext,
  bridgeHandlers,
  allowInteraction = true,
}: {
  url?: string;
  display?: ObjectPresentation;
  name: string;
  eager?: boolean;
  bridgeContext?: AuthenticatedExternalFaceContext;
  bridgeHandlers?: ExternalFaceBridgeHandlers;
  allowInteraction?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const externalFrame = useRef<HTMLIFrameElement>(null);
  const bridgeHost =
    useRef<ReturnType<typeof startAuthenticatedExternalFaceBridge>>(undefined);
  const [inlineDocument, setInlineDocument] = useState<string>();
  const imageUrl = display?.kind === "image" ? display.url : url;
  const externalDocumentUrl = (() => {
    if (
      display?.kind !== "external-document" ||
      !bridgeContext ||
      !externalFaceBridgeApplication(display.url)
    ) {
      return display?.kind === "external-document" ? display.url : undefined;
    }
    const value = new URL(display.url);
    value.searchParams.set("dual_bridge", "1");
    return value.toString();
  })();

  useEffect(() => {
    if (bridgeContext) bridgeHost.current?.updateContext(bridgeContext);
  }, [bridgeContext]);

  useEffect(
    () => () => {
      bridgeHost.current?.close();
      bridgeHost.current = undefined;
    },
    [display?.url],
  );

  useEffect(() => {
    if (display?.kind !== "document") return;
    const target = container.current;
    if (!target) return;
    let active = true;
    let controller: AbortController | undefined;
    const load = () => {
      controller = new AbortController();
      void fetch(display.url, {
        headers: { Accept: "text/plain" },
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("display unavailable");
          return response.text();
        })
        .then((source) => {
          if (active) setInlineDocument(sandboxedDocument(source));
        })
        .catch(() => undefined);
    };

    if (eager || typeof IntersectionObserver === "undefined") {
      load();
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          load();
        },
        { rootMargin: "240px" },
      );
      observer.observe(target);
      return () => {
        active = false;
        observer.disconnect();
        controller?.abort();
      };
    }
    return () => {
      active = false;
      controller?.abort();
    };
  }, [display, eager]);

  return (
    <div
      className="object-image"
      ref={container}
      style={{
        ...(display?.aspectRatio
          ? { aspectRatio: display.aspectRatio.replace("/", " / ") }
          : undefined),
        ...(display?.surface
          ? { backgroundColor: display.surface }
          : undefined),
      }}
    >
      {display?.kind === "external-document" ? (
        <iframe
          ref={externalFrame}
          className={cn(
            "object-display-frame",
            !(display.interactive && allowInteraction) && "is-inert",
          )}
          src={externalDocumentUrl}
          title={name}
          sandbox={EXTERNAL_DOCUMENT_SANDBOX}
          referrerPolicy="no-referrer"
          loading={eager ? "eager" : "lazy"}
          // A frame nobody can interact with must not sit in the tab order or
          // be announced: inventory cards would otherwise stack up dead stops.
          {...(display.interactive && allowInteraction
            ? {}
            : { tabIndex: -1, "aria-hidden": true })}
          onLoad={() => {
            bridgeHost.current?.close();
            bridgeHost.current =
              bridgeContext && externalFrame.current
                ? startAuthenticatedExternalFaceBridge({
                    frame: externalFrame.current,
                    displayUrl: externalDocumentUrl || display.url,
                    context: bridgeContext,
                    handlers: bridgeHandlers,
                  })
                : undefined;
          }}
        />
      ) : inlineDocument ? (
        <iframe
          className={cn(
            "object-display-frame",
            !(display?.interactive && allowInteraction) && "is-inert",
          )}
          srcDoc={inlineDocument}
          title={name}
          sandbox=""
          referrerPolicy="no-referrer"
          loading={eager ? "eager" : "lazy"}
          {...(display?.interactive && allowInteraction
            ? {}
            : { tabIndex: -1, "aria-hidden": true })}
        />
      ) : imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          loading={eager ? "eager" : "lazy"}
          sizes="(max-width: 760px) 100vw, (max-width: 980px) 50vw, 33vw"
          className="object-image-fill"
        />
      ) : (
        <Box
          className="object-image-placeholder"
          size={44}
          strokeWidth={1.5}
          aria-hidden
        />
      )}
    </div>
  );
}
