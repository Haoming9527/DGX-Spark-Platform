"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X, Loader2, Ticket, User, Mail, Lock, LogIn, UserPlus } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; username: string; email: string }) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      onSuccess(data.user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-[380px] bg-panel border border-border/80 rounded-2xl shadow-2xl overflow-hidden relative"
      >
        {/* Close Button: Elevated to root level of modal cards to prevent overlap from inner relative container divs */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/30 hover:text-foreground/70 transition-colors p-1.5 rounded-lg hover:bg-white/5 cursor-pointer z-50 animate-fade-in"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Branded header ─────────────────────────────────────────────── */}
        <div className="relative px-6 pt-5 pb-4 bg-gradient-to-b from-nvidia-green/[0.08] to-transparent border-b border-border/40">
          {/* Subtle glow behind logo */}
          <div className="absolute inset-x-0 top-0 h-20 bg-nvidia-green/5 blur-2xl pointer-events-none" />

          <div className="flex items-center gap-3 relative">
            {/* Logo badge */}
            <div className="w-11 h-11 rounded-xl bg-nvidia-green/10 border border-nvidia-green/25 flex items-center justify-center shadow-[0_0_20px_rgba(118,185,0,0.2)] overflow-hidden p-1.5 shrink-0">
              <Image src="/logo.svg" alt="DGX Spark" width={44} height={44} className="object-contain" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-nvidia-green/70 uppercase tracking-widest mb-0.5">
                DGX Spark Platform
              </div>
              <AnimatePresence mode="wait">
                <motion.h2
                  key={isLogin ? "login" : "signup"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-xl font-bold text-foreground leading-tight"
                >
                  {isLogin ? "Welcome back" : "Create account"}
                </motion.h2>
              </AnimatePresence>
            </div>
          </div>

          {/* Mode toggle tabs */}
          <div className="flex gap-1 mt-4 bg-background/60 border border-border/50 rounded-lg p-1 relative">
            <button
              onClick={() => switchMode(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                isLogin
                  ? "bg-nvidia-green/15 text-nvidia-green border border-nvidia-green/20 shadow-sm"
                  : "text-foreground/40 hover:text-foreground/70"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              onClick={() => switchMode(false)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                !isLogin
                  ? "bg-nvidia-green/15 text-nvidia-green border border-nvidia-green/20 shadow-sm"
                  : "text-foreground/40 hover:text-foreground/70"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Sign Up
            </button>
          </div>
        </div>

        {/* ── Form body ──────────────────────────────────────────────────── */}
        <div className="px-6 py-4">
          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 px-3.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium overflow-hidden"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={isLogin ? "login-fields" : "signup-fields"}
                initial={{ opacity: 0, x: isLogin ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-3"
              >
                {/* Username & Referral Code side by side (signup only) */}
                {!isLogin ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Username" icon={<User className="w-4 h-4" />}>
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
                      <Field label="Referral Code" icon={<Ticket className="w-4 h-4" />}>
                        <input
                          type="text"
                          required
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value)}
                          placeholder="Invite code"
                          className={INPUT_CLS}
                        />
                      </Field>
                    </div>

                    <Field label="Email Address" icon={<Mail className="w-4 h-4" />}>
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="john@example.com"
                        className={INPUT_CLS}
                      />
                    </Field>

                    <Field label="Password" icon={<Lock className="w-4 h-4" />}>
                      <input
                        type="password"
                        required
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        minLength={8}
                        maxLength={128}
                        className={INPUT_CLS}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Username or Email" icon={<User className="w-4 h-4" />}>
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

                    <Field label="Password" icon={<Lock className="w-4 h-4" />}>
                      <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
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
              className="w-full py-2 mt-2 bg-nvidia-green text-black font-bold rounded-xl text-sm hover:bg-nvidia-green/90 active:scale-[0.98] transition-all shadow-lg shadow-nvidia-green/15 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
              ) : isLogin ? (
                <><LogIn className="w-4 h-4" /> Sign In</>
              ) : (
                <><UserPlus className="w-4 h-4" /> Create Account</>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const INPUT_CLS =
  "w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm text-foreground " +
  "placeholder:text-foreground/20 focus:border-nvidia-green/50 focus:ring-1 focus:ring-nvidia-green/10 " +
  "outline-none transition-all";

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
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wider">{label}</label>
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/30 pointer-events-none z-10">{icon}</div>
        {children}
      </div>
    </div>
  );
}
