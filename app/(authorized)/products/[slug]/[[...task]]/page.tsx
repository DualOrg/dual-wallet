import { notFound, redirect } from "next/navigation";
import { hostPageAllowed } from "@/api/wallet-host";
import { isTaskPath, productTaskHref } from "@/app/_domain/product-face";

// A stable task link: /products/<slug>/<task path>. Anything that is not a
// valid task path goes back to the programme entry.
export default async function ProductTaskPage({
  params,
}: {
  params: Promise<{ slug: string; task?: string[] }>;
}) {
  const { slug, task } = await params;
  const path = task?.length
    ? `/${task.map((segment) => decodeURIComponent(segment)).join("/")}`
    : "/";
  if (!isTaskPath(path)) redirect(`/products/${slug}`);
  // A branded host serves no task of a disabled journey (the request proxy
  // already answers it 404; this is the page's own check).
  if (!hostPageAllowed(productTaskHref(slug, path))) notFound();
  return null;
}
