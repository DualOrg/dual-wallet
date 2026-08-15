import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/app/_components/design-system/theme-toggle";
import { ObjectDetail } from "@/app/_components/inventory/object-detail";
import { ShareObjectButton } from "@/app/_components/inventory/share-object-button";
import {
  getPublicObject,
  isPublicObjectNotFound,
} from "@/app/_services/public-object.server";

async function loadPublicObject(objectId: string) {
  try {
    const item = await getPublicObject(objectId);
    if (!item) notFound();
    return item;
  } catch (error) {
    if (isPublicObjectNotFound(error)) {
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
    return { title: t("publicNotFound") };
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
      <header className="public-object-header has-object-menu">
        <div className="public-object-header-actions">
          <Link href="/" className="button button-secondary">
            {t("openViewer")}
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="public-object-content">
        <ObjectDetail
          item={item}
          action={<ShareObjectButton objectId={item.id} />}
        />
      </div>
    </main>
  );
}
