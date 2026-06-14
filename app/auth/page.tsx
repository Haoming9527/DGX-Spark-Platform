"use client";

import { useRouter } from "next/navigation";
import { AuthModal } from "../components/AuthModal";

export default function AuthPage() {
  const router = useRouter();

  return (
    <AuthModal
      isOpen
      onClose={() => router.push("/")}
      onSuccess={() => router.push("/apikeys/manage")}
    />
  );
}
