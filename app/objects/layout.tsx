import { ThemeProvider } from "@/app/_providers/theme-provider";

export default function PublicObjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
