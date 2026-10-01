"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ticket, User, Mail, Lock, LogIn, UserPlus } from "lucide-react";
import { LogoMark } from "./ui/LogoMark";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; username: string; email: string; role?: string }) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener?.isConnected && !opener.matches(":disabled")) opener.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const switchMode = (login: boolean) => {
    setIsLogin(login);
    setError(null);
    setUsername("");
    setEmail("");
    setPassword("");
    setReferralCode("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const url = isLogin ? "/api/auth/login" : "/api/auth/signup";
    const body = isLogin
      ? { identifier: username || email, password }
      : { username, email, password, referralCode };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let data: { error?: string; user?: { id: string; username: string; email: string } } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.status === 404
            ? "Auth API not found. Restart the Next.js dev server and try again."
            : `Unexpected response (${res.status}).`
        );
      }
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      if (!data.user) throw new Error("Login succeeded but no user returned.");
      onSuccess(data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const card = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="sticker relative flex max-h-[calc(100dvh_-_2rem)] w-full flex-col overflow-hidden !rounded-[1.35rem]"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--sticker-edge)] px-5 pb-4 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark size={26} />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-muted">DGX Spark</p>
            <AnimatePresence mode="wait">
              <motion.h2
                key={isLogin ? "login" : "signup"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="font-display text-[1.35rem] font-bold tracking-tight text-foreground"
              >
                {isLogin ? "Welcome back" : "Create account"}
              </motion.h2>
            </AnimatePresence>
          </div>
        </div>
          <button
            type="button"
            onClick={onClose}
            className="exit-sign shrink-0 scale-90 origin-top-right"
            aria-label="Close"
          >
            <span className="exit-sign-face !px-2.5 !py-1.5">
              <span className="exit-sign-arrow" aria-hidden />
              <span className="exit-sign-word !text-[0.9rem]">EXIT</span>
            </span>
          </button>
      </div>

      <div className="custom-scrollbar min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => switchMode(true)}
            aria-pressed={isLogin}
            className={`sticker-sm inline-flex h-9 items-center gap-1.5 px-3.5 text-[13px] font-semibold transition-[filter] hover:brightness-110 ${
              isLogin ? "sticker-cta" : "text-muted hover:text-foreground"
            }`}
          >
            <LogIn className="h-3.5 w-3.5" strokeWidth={2.25} />
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode(false)}
            aria-pressed={!isLogin}
            className={`sticker-sm inline-flex h-9 items-center gap-1.5 px-3.5 text-[13px] font-semibold transition-[filter] hover:brightness-110 ${
              !isLogin ? "sticker-cta" : "text-muted hover:text-foreground"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" strokeWidth={2.25} />
            Sign up
          </button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 overflow-hidden rounded-xl border border-alert/30 bg-alert/10 px-3.5 py-2.5 text-[13px] font-medium text-alert"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login-fields" : "signup-fields"}
              initial={{ opacity: 0, x: isLogin ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-3.5"
            >
              {!isLogin ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Username" icon={<User className="h-4 w-4" strokeWidth={2} />}>
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="john_doe"
                        minLength={3}
                        maxLength={50}
                        className={INPUT_CLS}
                      />
                    </Field>
                    <Field label="Invite code" icon={<Ticket className="h-4 w-4" strokeWidth={2} />}>
                      <input
                        type="text"
                        required
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value)}
                        placeholder="Code"
                        className={INPUT_CLS}
                      />
                    </Field>
                  </div>

                  <Field label="Email" icon={<Mail className="h-4 w-4" strokeWidth={2} />}>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={INPUT_CLS}
                    />
                  </Field>

                  <Field label="Password" icon={<Lock className="h-4 w-4" strokeWidth={2} />}>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      minLength={8}
                      maxLength={128}
                      className={INPUT_CLS}
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Username or email" icon={<User className="h-4 w-4" strokeWidth={2} />}>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username or email"
                      className={INPUT_CLS}
                    />
                  </Field>

                  <Field label="Password" icon={<Lock className="h-4 w-4" strokeWidth={2} />}>
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      minLength={1}
                      maxLength={128}
                      className={INPUT_CLS}
                    />
                  </Field>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="sticker-sm sticker-cta mt-1 inline-flex h-11 w-full items-center justify-center gap-2 text-[14px] font-semibold transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <LogoMark size={16} bare className="logo-spin" />
                <span>{isLogin ? "Signing in…" : "Creating…"}</span>
              </>
            ) : isLogin ? (
              <>
                <LogIn className="h-4 w-4" strokeWidth={2.25} />
                Sign in
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" strokeWidth={2.25} />
                Create account
              </>
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-muted">
          Invite-only · Chat isn&apos;t saved
        </p>
      </div>
    </motion.div>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-label={isLogin ? "Log in" : "Sign up"}
      className="fixed m-auto max-h-none w-[calc(100%_-_2rem)] max-w-[400px] overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/50"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      {card}
    </dialog>
  );
}

const INPUT_CLS =
  "w-full rounded-xl border border-[var(--sticker-edge)] bg-panel py-2.5 pl-10 pr-3.5 text-sm text-foreground " +
  "outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 " +
  "focus:border-nvidia-green/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--nvidia-green)_18%,transparent)]";

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium text-muted">{label}</label>
      <div className="relative">
        <div className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[#6366f1]">
          {icon}
        </div>
        {children}
      </div>
    </div>
  );
}
