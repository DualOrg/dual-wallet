import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Providers } from "@/app/_providers/providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://demo.localhost:3000",
  ),
  title: { default: "Dual Viewer", template: "%s · Dual Viewer" },
  description: "Your secure smart object inventory and wallet activity.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
  },
  openGraph: {
    title: "Dual Viewer",
    description: "Your secure smart object inventory and wallet activity.",
    images: [{ url: "/og-viewer.png", width: 1745, height: 909 }],
  },
  twitter: { card: "summary_large_image", images: ["/og-viewer.png"] },
  robots: { index: false, follow: false },
};

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
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
