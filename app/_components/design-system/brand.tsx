import Image from "next/image";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="brand" style={inverse ? { color: "#fff" } : undefined}>
      <Image
        className="brand-mark"
        src="/favicon.svg"
        alt=""
        width={34}
        height={34}
        aria-hidden
      />
      <span>Dual Viewer</span>
    </span>
  );
}
