import { hostLogo, walletHost } from "@/api/wallet-host";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/host/logo/<sha256>: exactly the pinned logo bytes of the active
 * host configuration. The URL names the content, so the answer is immutable;
 * any other hash is 404, and an invalid configuration serves no logo at all.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sha256: string }> },
) {
  const { sha256 } = await params;
  if (walletHost().status === "invalid") {
    return new Response(null, { status: 503, headers: NO_STORE });
  }
  const logo = hostLogo(sha256);
  if (!logo) return new Response(null, { status: 404, headers: NO_STORE });
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.mediaType,
      "Content-Length": String(logo.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${logo.sha256}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
