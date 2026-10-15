import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonClass } from "@/app/_components/design-system/button";
import { Brand } from "@/app/_components/design-system/brand";
import type { HostHomeView } from "@/app/_domain/wallet-host";

/**
 * A branded host's home: its validated headline and introduction, its primary
 * journey and its other enabled journeys. Only enabled, backed journeys and
 * allowlisted navigation entries reach it; it shows nothing private, so it
 * renders the same signed in or out apart from the sign-in links.
 */
export function HostHome({
  home,
  signedIn,
}: {
  home: HostHomeView;
  signedIn: boolean;
}) {
  const t = useTranslations("host");
  const nav = useTranslations("nav");
  return (
    <div className="host-home">
      <header className="host-home-header">
        <Brand host={home.brand} />
        <nav className="host-home-nav" aria-label={t("homeNavigation")}>
          {signedIn ? (
            home.navigation.map(({ entry, href }) => (
              <Link key={entry} href={href} className="host-home-link">
                {nav(entry)}
              </Link>
            ))
          ) : (
            <>
              <Link href="/login" className="host-home-link">
                {t("signIn")}
              </Link>
              <Link href="/register" className="host-home-link">
                {t("createAccount")}
              </Link>
            </>
          )}
        </nav>
      </header>
      <main id="main-content" className="host-home-main">
        <h1 className="host-home-headline">{home.headline}</h1>
        <p className="host-home-introduction">{home.introduction}</p>
        <p className="host-home-primary">
          <Link href={home.primary.href} className={buttonClass("primary")}>
            {t(`journeys.${home.primary.journey}`)}
          </Link>
        </p>
        {home.journeys.length ? (
          <ul className="host-home-journeys" aria-label={t("journeysLabel")}>
            {home.journeys.map(({ journey, href }) => (
              <li key={journey}>
                <Link href={href} className={buttonClass("secondary")}>
                  {t(`journeys.${journey}`)}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
