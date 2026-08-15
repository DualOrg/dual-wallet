import { ObjectPageClient } from "@/app/_components/inventory/object-page-client";

export default async function ObjectPage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const { objectId } = await params;
  return <ObjectPageClient objectId={decodeURIComponent(objectId)} />;
}
