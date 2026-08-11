import { AuthShell } from "@/app/_components/auth/auth-shell";

export default function UnauthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
