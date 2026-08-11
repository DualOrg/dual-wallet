import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/api/settings";

export default async function Home() {
  const cookieStore = await cookies();
  redirect(cookieStore.has(SESSION_COOKIE_NAME) ? "/inventory" : "/login");
}
