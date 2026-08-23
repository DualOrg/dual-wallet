import { Suspense } from "react";
import { VerifyPageClient } from "@/app/_components/auth/verify-page-client";

// The client reads the code out of the query string, and useSearchParams needs
// a boundary to suspend against while the page is prerendered.
export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="card skeleton" aria-hidden />}>
      <VerifyPageClient />
    </Suspense>
  );
}
