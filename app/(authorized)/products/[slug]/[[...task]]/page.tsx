import { redirect } from "next/navigation";
import { isTaskPath } from "@/app/_domain/product-face";

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
  return null;
}
