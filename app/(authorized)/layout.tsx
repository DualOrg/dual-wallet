import { cookies } from "next/headers";
import { resolvePlatform, sandboxApiUrl } from "@/api/platform";
import { PLATFORM_COOKIE_NAME } from "@/api/settings";
import { AppShell } from "@/app/_components/app-shell";
import { PlatformSelector } from "@/app/_components/platform-selector";
import { Providers } from "@/app/_providers/providers";

export default async function AuthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const platform = resolvePlatform(
    (await cookies()).get(PLATFORM_COOKIE_NAME)?.value,
  );
  return (
    <Providers>
      <AppShell
        platformSelector={
          <PlatformSelector
            platform={platform}
            sandboxAvailable={Boolean(sandboxApiUrl())}
          />
        }
      >
        {children}
      </AppShell>
    </Providers>
  );
}
