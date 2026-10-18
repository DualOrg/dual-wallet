import {
  HOST_NOTICE_STYLE,
  hostNoticeCopy,
  type HostNoticeKind,
} from "@/api/host-notice";

/**
 * The root document while a branded host cannot serve as itself. The request
 * proxy already answers every page with the same notice; this keeps the
 * layout from ever rendering the generic wallet or a brand in that state.
 */
export function HostNoticeDocument({ kind }: { kind: HostNoticeKind }) {
  const { title, description } = hostNoticeCopy(kind);
  return (
    <html lang="en" data-wallet-host-notice="">
      <head>
        {/* A fixed engine constant: system colours and fonts only. */}
        <style dangerouslySetInnerHTML={{ __html: HOST_NOTICE_STYLE }} />
      </head>
      <body>
        <main>
          <h1>{title}</h1>
          <p>{description}</p>
        </main>
      </body>
    </html>
  );
}
