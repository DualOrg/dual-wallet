import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;
  return NextResponse.redirect(
    new URL(`/objects/${encodeURIComponent(objectId)}`, request.url),
    308,
  );
}
