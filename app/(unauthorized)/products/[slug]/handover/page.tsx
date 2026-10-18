import type { Metadata } from "next";
import { productFaceBinding } from "@/api/product-face-registry";
import { ProductFaceHandover } from "@/app/_components/products/product-face-handover";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { referrer: "no-referrer" };

// contract r14: the wallet's face handover entry. It works signed-out; the
// client strips the ticket from the fragment before anything else and hands
// it to the BFF only for a programme whose binding enables handover.
export default async function ProductFaceHandoverPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const binding = productFaceBinding(slug);
  return (
    <ProductFaceHandover
      slug={slug}
      available={Boolean(binding?.handover.enabled)}
      programmeName={binding?.handover.enabled ? binding.programmeName : null}
    />
  );
}
