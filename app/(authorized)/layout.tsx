import { hostPresentation } from "@/api/wallet-host";
import { AppShell } from "@/app/_components/app-shell";
import { Providers } from "@/app/_providers/providers";

export default function AuthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers host={hostPresentation()}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
