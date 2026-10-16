import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hostLanding, hostPresentation } from "@/api/wallet-host";
import { Brand } from "@/app/_components/design-system/brand";
import { buttonClass } from "@/app/_components/design-system/button";

/**
 * The not-found page outside the signed-in shell: an unknown address, and
 * every page a branded host refuses (a disabled journey's, another face's,
 * a task outside the contract's routes; the request proxy rewrites them
 * here). It carries the host's own name, logo, colours and typeface (the
 * root layout's tokens), or the generic wallet's, and a way back to the
 * host's landing page.
 */
export default async function NotFound() {
  const t = await getTranslations("errors");
  const common = await getTranslations("common");
  const host = hostPresentation();
  const landing = hostLanding();
  return (
    <div className="host-home">
      <header className="host-home-header">
        <Brand host={host} />
      </header>
      <main id="main-content" className="host-home-main">
        <h1 className="host-home-headline">{t("notFoundTitle")}</h1>
        <p className="host-home-introduction">{t("notFoundDescription")}</p>
        <p className="host-home-primary">
          <Link href={landing} className={buttonClass("secondary")}>
            {landing === "/" ? common("goToHome") : common("goToInventory")}
          </Link>
        </p>
      </main>
    </div>
  );
}
