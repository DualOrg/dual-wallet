import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/app/_components/design-system/button";

export default async function NotFound() {
  const t = await getTranslations("errors");
  const common = await getTranslations("common");
  return (
    <div className="card empty-state">
      <div>
        <h1>{t("notFoundTitle")}</h1>
        <p>{t("notFoundDescription")}</p>
        <div className="load-more">
          <Link href="/inventory" className={buttonClass("secondary")}>
            {common("goToInventory")}
          </Link>
        </div>
      </div>
    </div>
  );
}
