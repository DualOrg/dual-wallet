import { AppShell } from "@/app/_components/app-shell";
import { Providers } from "@/app/_providers/providers";

export default function AuthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
