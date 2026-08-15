import { AuthShell } from "@/app/_components/auth/auth-shell";
import { Providers } from "@/app/_providers/providers";

export default function UnauthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <AuthShell>{children}</AuthShell>
    </Providers>
  );
}
