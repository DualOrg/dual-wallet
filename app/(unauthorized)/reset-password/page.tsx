import { ResetPasswordPageClient } from "@/app/_components/auth/reset-password-page-client";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordPageClient token={token} />;
}
