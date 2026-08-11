import Image from "next/image";
import { Box } from "lucide-react";

export function ObjectVisual({
  url,
  name,
  eager = false,
}: {
  url?: string;
  name: string;
  eager?: boolean;
}) {
  return (
    <div className="object-image">
      {url ? (
        <Image
          src={url}
          alt={name}
          fill
          loading={eager ? "eager" : "lazy"}
          sizes="(max-width: 760px) 100vw, (max-width: 980px) 50vw, 33vw"
          style={{ objectFit: "cover" }}
        />
      ) : (
        <Box
          className="object-image-placeholder"
          size={44}
          strokeWidth={1.5}
          aria-hidden
        />
      )}
    </div>
  );
}
