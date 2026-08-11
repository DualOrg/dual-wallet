import { AppShell } from "@/app/_components/app-shell";

export default function AuthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
