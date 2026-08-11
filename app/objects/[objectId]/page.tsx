import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { Brand } from "@/app/_components/design-system/brand";
import { ObjectDetail } from "@/app/_components/inventory/object-detail";
import { toPublicObject } from "@/app/_domain/inventory";
import { getObjectsApi } from "@/api/web-sdk-client";
import { ResponseError } from "@/api/web-sdk/runtime";

const getPublicObject = cache(async (objectId: string) => {
  const result = await getObjectsApi().listObjectsPublic(
    {
      id: objectId,
      limit: 1,
      include: ["display"],
      displayVariant: "detail",
    },
    { cache: "no-store" },
  );
  const item = result.items?.[0];
  if (item) return toPublicObject(item.object, item.display);
  const object = result.objects[0];
  return object ? toPublicObject(object) : undefined;
});

async function loadPublicObject(objectId: string) {
  try {
    const item = await getPublicObject(objectId);
    if (!item) notFound();
    return item;
  } catch (error) {
    if (error instanceof ResponseError && error.response.status === 404) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ objectId: string }>;
}): Promise<Metadata> {
  const { objectId } = await params;
  const t = await getTranslations("object");
  try {
    const item = await loadPublicObject(objectId);
    const description = item.description || t("publicDescription");
    const images = item.imageUrl ? [{ url: item.imageUrl }] : undefined;
    return {
      title: item.name,
      description,
      alternates: { canonical: `/objects/${encodeURIComponent(item.id)}` },
      openGraph: { title: item.name, description, images },
      twitter: {
        card: "summary_large_image",
        title: item.name,
        description,
        images,
      },
    };
  } catch {
    return { title: "Object not available" };
  }
}

export default async function PublicObjectPage({
  params,
}: {
  params: Promise<{ objectId: string }>;
}) {
  const { objectId } = await params;
  const [item, t] = await Promise.all([
    loadPublicObject(objectId),
    getTranslations("object"),
  ]);

  return (
    <main className="public-object-page">
      <header className="public-object-header">
        <Link href="/" aria-label="Dual Viewer home">
          <Brand />
        </Link>
        <Link href="/" className="button button-secondary">
          {t("openViewer")}
        </Link>
      </header>
      <div className="public-object-content">
        <p className="public-object-label">{t("publicLabel")}</p>
        <ObjectDetail item={item} />
      </div>
    </main>
  );
}
