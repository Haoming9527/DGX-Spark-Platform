import type { ReactNode } from "react";

type StickerProps = {
  children: ReactNode;
  className?: string;
  dark?: boolean;
};

export function Sticker({ children, className = "", dark = false }: StickerProps) {
  return (
    <div className={`${dark ? "sticker-dark" : "sticker"} ${className}`}>{children}</div>
  );
}
