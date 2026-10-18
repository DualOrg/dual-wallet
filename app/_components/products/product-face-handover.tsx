"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/app/_components/design-system/alert";
import { ProductFaceError } from "@/app/_domain/product-face";
import { useHostPresentation } from "@/app/_providers/host-provider";
import { submitFaceHandover } from "@/app/_services/product-face.client";

const TICKET = /^[A-Za-z0-9_-]{32,256}$/;

type HandoverState = "working" | "unavailable" | "invalid" | "failed";

/**
 * contract r14 step 3. Reads the one-time ticket from the fragment, strips the
 * fragment at once (before any request), and hands the ticket to the BFF,
 * which keeps it in a sealed pre-auth cookie. Then it leaves for the register
 * task; a signed-out visitor goes through sign-in and returns there.
 *
 * G8 (contract r16 acceptanceLink): `#accept=<ticket>` is a transfer
 * acceptance the same way; it continues to the face's accept task.
 */
export function ProductFaceHandover({
  slug,
  available,
  programmeName,
  leave = (next: string) => window.location.replace(next),
}: {
  slug: string;
  available: boolean;
  programmeName: string | null;
  /** A full navigation, so the request proxy can send a signed-out visitor
   * through sign-in; replace() keeps this entry out of the history. */
  leave?: (next: string) => void;
}) {
  const t = useTranslations("products.handover");
  const home = useHostPresentation() ? "/" : "/inventory";
  // Everything is decided after the fragment is stripped (on hydration), so
  // no outcome is shown while the ticket is still in the address bar.
  const [state, setState] = useState<HandoverState>("working");
  const [accepting, setAccepting] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = window.location.hash.slice(1);
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    const handOver = async (): Promise<HandoverState> => {
      const params = new URLSearchParams(fragment);
      const accept = params.get("accept");
      if (accept !== null) setAccepting(true);
      if (!available) return "unavailable";
      const ticket = accept ?? params.get("ticket");
      if (!ticket || !TICKET.test(ticket)) return "invalid";
      try {
        leave(
          await submitFaceHandover(
            slug,
            ticket,
            accept !== null ? "accept" : "handover",
          ),
        );
        return "working";
      } catch (error) {
        const code = error instanceof ProductFaceError ? error.code : "";
        return code === "handover_unavailable"
          ? "unavailable"
          : code === "invalid_request"
            ? "invalid"
            : "failed";
      }
    };
    void handOver().then(setState);
  }, [available, leave, slug]);

  return (
    <section className="product-face-handover" aria-live="polite">
      <h1>{programmeName ?? t("title")}</h1>
      {state === "working" ? (
        <p className="product-face-status" role="status">
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
          {t(accepting ? "acceptWorking" : "working")}
        </p>
      ) : (
        <>
          <Alert>
            {t(
              accepting
                ? (`accept${state[0].toUpperCase()}${state.slice(1)}` as
                    "acceptUnavailable" | "acceptInvalid" | "acceptFailed")
                : state,
            )}
          </Alert>
          <p>
            <Link href={home}>{t("home")}</Link>
          </p>
        </>
      )}
    </section>
  );
}
