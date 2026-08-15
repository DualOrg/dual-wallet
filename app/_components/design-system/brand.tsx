import Image from "next/image";
import { useTranslations } from "next-intl";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  const t = useTranslations("common");
  return (
    <span className={inverse ? "brand brand-inverse" : "brand"}>
      <Image
        className="brand-mark"
        src="/favicon.svg"
        alt=""
        width={34}
        height={34}
        aria-hidden
      />
      <span>{t("brand")}</span>
    </span>
  );
}
