import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { hostNoticeCopy } from "@/api/host-notice";
import {
  hostMetadata,
  hostPresentation,
  hostStyle,
  walletHost,
} from "@/api/wallet-host";
import { HostNoticeDocument } from "@/app/_components/host/host-notice";
import "@/app/globals.css";

export async function generateMetadata(): Promise<Metadata> {
  if (walletHost().status === "invalid") {
    return {
      title: hostNoticeCopy("setup").title,
      robots: { index: false, follow: false },
    };
  }
  const host = hostMetadata();
  if (host) return host;
  const t = await getTranslations("metadata");
  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_APP_URL || "http://demo.localhost:3000",
    ),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: ["/favicon.svg"],
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      images: [{ url: "/og-viewer.png", width: 1745, height: 909 }],
    },
    twitter: { card: "summary_large_image", images: ["/og-viewer.png"] },
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A branded host whose configuration is invalid never renders the generic
  // wallet or a brand (the request proxy answers 503 before this).
  if (walletHost().status === "invalid") {
    return <HostNoticeDocument kind="setup" />;
  }
  const messages = await getMessages();
  const host = hostPresentation();
  const style = hostStyle();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      {...(host ? { "data-wallet-host": host.brand.id } : {})}
    >
      <head>
        {style ? (
          // A branded host renders its one validated palette and bundled
          // family. hostTokenCss emits only re-checked #rrggbb values and
          // engine-owned font stacks, so nothing configured is ever markup.
          <style dangerouslySetInnerHTML={{ __html: style }} />
        ) : (
          /* Applies the stored or system theme before first paint so dark-theme
            users never see a light flash. */
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var t=localStorage.getItem("viewer-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}`,
            }}
          />
        )}
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
