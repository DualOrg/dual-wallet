"use client";

import Image from "next/image";
import { Box } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ObjectPresentation } from "@/app/_domain/inventory";

const DOCUMENT_POLICY = [
  "default-src 'none'",
  "img-src https: data:",
  "style-src 'unsafe-inline'",
  "font-src https: data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const EXTERNAL_DOCUMENT_SANDBOX =
  "allow-forms allow-same-origin allow-scripts";

function sandboxedDocument(source: string) {
  return `<meta http-equiv="Content-Security-Policy" content="${DOCUMENT_POLICY}">${source}`;
}

export function ObjectVisual({
  url,
  display,
  name,
  eager = false,
}: {
  url?: string;
  display?: ObjectPresentation;
  name: string;
  eager?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<string>();
  const imageUrl = display?.kind === "image" ? display.url : url;

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
          if (active) setDocument(sandboxedDocument(source));
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
      style={
        display?.aspectRatio
          ? { aspectRatio: display.aspectRatio.replace("/", " / ") }
          : undefined
      }
    >
      {display?.kind === "external-document" ? (
        <iframe
          className="object-display-frame"
          src={display.url}
          title={name}
          sandbox={EXTERNAL_DOCUMENT_SANDBOX}
          referrerPolicy="no-referrer"
          loading={eager ? "eager" : "lazy"}
          style={{ pointerEvents: display.interactive ? "auto" : "none" }}
        />
      ) : document ? (
        <iframe
          className="object-display-frame"
          srcDoc={document}
          title={name}
          sandbox=""
          referrerPolicy="no-referrer"
          loading={eager ? "eager" : "lazy"}
          style={{ pointerEvents: display?.interactive ? "auto" : "none" }}
        />
      ) : imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          loading={eager ? "eager" : "lazy"}
          sizes="(max-width: 760px) 100vw, (max-width: 980px) 50vw, 33vw"
          style={{ objectFit: "cover" }}
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
