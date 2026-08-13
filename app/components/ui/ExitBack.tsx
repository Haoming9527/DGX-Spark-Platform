import Link from "next/link";

type ExitBackProps = {
  href: string;
  className?: string;
};

export function ExitBack({ href, className = "" }: ExitBackProps) {
  return (
    <Link href={href} className={`exit-sign ${className}`} aria-label="Exit — go back">
      <span className="exit-sign-face">
        <span className="exit-sign-arrow" aria-hidden="true" />
        <span className="exit-sign-word">EXIT</span>
      </span>
    </Link>
  );
}
