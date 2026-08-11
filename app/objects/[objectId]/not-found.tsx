import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/app/_components/design-system/brand";
import { EmptyState } from "@/app/_components/design-system/empty-state";

export default async function PublicObjectNotFound() {
  const t = await getTranslations("object");
  return (
    <main className="public-object-page">
      <header className="public-object-header">
        <Link href="/" aria-label="Dual Viewer home">
          <Brand />
        </Link>
      </header>
      <div className="public-object-content">
        <EmptyState
          icon={AlertTriangle}
          title={t("publicNotFound")}
          description={t("publicNotFoundDescription")}
          action={
            <Link href="/" className="button button-secondary">
              {t("openViewer")}
            </Link>
          }
        />
      </div>
    </main>
  );
}
