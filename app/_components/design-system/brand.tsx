import Image from "next/image";
import { useTranslations } from "next-intl";
import type { HostPresentation } from "@/app/_domain/wallet-host";

/**
 * The wallet's mark and name. A branded host passes its own (validated name,
 * content-addressed logo served from the pinned bytes); without one the
 * generic wallet's are used.
 */
export function Brand({
  inverse = false,
  host = null,
}: {
  inverse?: boolean;
  host?: Pick<HostPresentation, "brand" | "logo"> | null;
}) {
  const t = useTranslations("common");
  return (
    <span className={inverse ? "brand brand-inverse" : "brand"}>
      {host ? (
        <Image
          className="brand-mark"
          src={host.logo.src}
          alt=""
          width={34}
          height={34}
          aria-hidden
          unoptimized
        />
      ) : (
        <Image
          className="brand-mark"
          src="/favicon.svg"
          alt=""
          width={34}
          height={34}
          aria-hidden
        />
      )}
      <span>{host ? host.brand.name : t("brand")}</span>
    </span>
  );
}
