import { getTranslations } from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations("common");
  return (
    <div
      className="card skeleton"
      role="status"
      aria-label={t("loadingPage")}
    />
  );
}
