import "server-only";

import messages from "@/messages/en.json";

/**
 * The neutral notices a branded host deployment answers with instead of any
 * page while it cannot serve as itself: 503 while its configuration is
 * invalid ("being set up"), 421 on any address but its entrance. They carry
 * no brand, no generic wallet identity and no other organisation's.
 */
export type HostNoticeKind = "setup" | "misdirected";

export const HOST_NOTICE_STATUS: Record<HostNoticeKind, number> = {
  setup: 503,
  misdirected: 421,
};

export const HOST_NOTICE_CODE: Record<HostNoticeKind, string> = {
  setup: "host_unavailable",
  misdirected: "host_misdirected",
};

/** System colours and fonts only: independent of every brand token. */
export const HOST_NOTICE_STYLE =
  "html[data-wallet-host-notice] body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f5;color:#18181b;font-family:ui-sans-serif,system-ui,sans-serif}html[data-wallet-host-notice] main{max-width:34rem;padding:2rem}html[data-wallet-host-notice] h1{margin:0 0 .75rem;font-size:1.6rem;line-height:1.2}html[data-wallet-host-notice] p{margin:0;color:#3f3f46;line-height:1.6}";

export function hostNoticeCopy(kind: HostNoticeKind) {
  return kind === "setup"
    ? {
        title: messages.host.setupTitle,
        description: messages.host.setupDescription,
      }
    : {
        title: messages.host.misdirectedTitle,
        description: messages.host.misdirectedDescription,
      };
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The whole notice page, for the request proxy to answer with. */
export function hostNoticeHtml(kind: HostNoticeKind) {
  const { title, description } = hostNoticeCopy(kind);
  return `<!doctype html><html lang="en" data-wallet-host-notice=""><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escapeHtml(
    title,
  )}</title><style>${HOST_NOTICE_STYLE}</style></head><body><main><h1>${escapeHtml(
    title,
  )}</h1><p>${escapeHtml(description)}</p></main></body></html>`;
}
