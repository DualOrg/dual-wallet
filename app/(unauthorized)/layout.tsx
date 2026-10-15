import { hostPresentation } from "@/api/wallet-host";
import { AuthShell } from "@/app/_components/auth/auth-shell";
import { Providers } from "@/app/_providers/providers";

export default function UnauthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = hostPresentation();
  return (
    <Providers host={host}>
      <AuthShell host={host}>{children}</AuthShell>
    </Providers>
  );
}
