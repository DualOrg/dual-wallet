import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/app/_components/design-system/empty-state";
import { ThemeToggle } from "@/app/_components/design-system/theme-toggle";

export default async function PublicObjectNotFound() {
  const t = await getTranslations("object");
  return (
    <main className="public-object-page">
      <header className="public-object-header">
        <div className="public-object-header-actions">
          <ThemeToggle />
          <Link href="/" className="button button-secondary">
            {t("openViewer")}
          </Link>
        </div>
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
