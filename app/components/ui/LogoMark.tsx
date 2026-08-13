import Image from "next/image";
import Link from "next/link";

type LogoMarkProps = {
  size?: number;
  className?: string;
  href?: string;
  bare?: boolean;
};

export function LogoMark({ size = 28, className = "", href, bare = false }: LogoMarkProps) {
  const pad = bare ? 0 : Math.max(10, Math.round(size * 0.35));
  const inner = (
    <span
      className={`${bare ? "" : "logo-face"} shrink-0 ${className}`}
      style={{ width: size + pad, height: size + pad }}
    >
      <Image
        src="/logo.svg"
        alt="DGX Spark"
        width={size}
        height={size}
        className="object-contain"
        priority
      />
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex transition-[filter] hover:brightness-105" aria-label="DGX Spark home">
        {inner}
      </Link>
    );
  }

  return inner;
}
