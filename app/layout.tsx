import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import "@/app/globals.css";

export async function generateMetadata(): Promise<Metadata> {
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
  const messages = await getMessages();
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
