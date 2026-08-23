import { Suspense } from "react";
import { OtpPageClient } from "@/app/_components/auth/otp-page-client";

// The client reads the code out of the query string, and useSearchParams needs
// a boundary to suspend against while the page is prerendered.
export default function OtpPage() {
  return (
    <Suspense fallback={<div className="card skeleton" aria-hidden />}>
      <OtpPageClient />
    </Suspense>
  );
}
