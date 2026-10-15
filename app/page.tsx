import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/api/settings";
import { hostHome } from "@/api/wallet-host";
import { HostHome } from "@/app/_components/host/host-home";

export default async function Home() {
  const cookieStore = await cookies();
  const signedIn = cookieStore.has(SESSION_COOKIE_NAME);
  // A branded host renders its configured home; the generic wallet goes
  // straight to inventory or sign-in, as it always has.
  const home = hostHome();
  if (home) return <HostHome home={home} signedIn={signedIn} />;
  redirect(signedIn ? "/inventory" : "/login");
}
