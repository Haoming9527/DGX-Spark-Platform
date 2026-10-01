"use client";

import { useRouter } from "next/navigation";

export function ExitButton() {
  const router = useRouter();

  function exit() {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) router.replace("/");
    }, 150);
  }

  return (
    <button type="button" className="exit-sign min-h-11 items-center" onClick={exit} aria-label="Exit authorization">
      <span className="exit-sign-face">
        <span className="exit-sign-arrow" aria-hidden="true" />
        <span className="exit-sign-word">EXIT</span>
      </span>
    </button>
  );
}
