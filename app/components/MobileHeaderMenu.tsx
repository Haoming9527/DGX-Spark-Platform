"use client";

import { useEffect, useId, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Activity, ArrowUpRight, BookOpen, Key, LogIn, LogOut, Moon, Power, RefreshCw, Shield, Sidebar, Sun } from "lucide-react";
import { useTheme } from "./ui/ThemeToggle";

interface MobileHeaderMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  onOpen: () => void;
  user: { role?: string } | null;
  clearChat: () => void;
  onLogout: () => void;
  onSidebarToggle?: () => void;
}

export function MobileHeaderMenu({ open, setOpen, onOpen, user, clearChat, onLogout, onSidebarToggle }: MobileHeaderMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const reduceMotion = useReducedMotion();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      toggleRef.current?.focus();
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const dismissOnDesktop = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    desktop.addEventListener("change", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
      desktop.removeEventListener("change", dismissOnDesktop);
    };
  }, [open, setOpen]);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };
  const links = [
    ...(user?.role === "admin" ? [{ href: "/admin/users", label: "Admin", icon: Shield, color: "text-nvidia-green" }] : []),
    ...(user?.role === "operator" ? [{ href: "/power", label: "Power", icon: Power, color: "text-nvidia-green" }] : []),
    { href: "/status", label: "Status", icon: Activity, color: "text-[#ff5c5c]" },
    { href: "/documentation", label: "Documentation", icon: BookOpen, color: "text-[#3b82f6]" },
    ...(user ? [{ href: "/apikeys/manage", label: "API keys", icon: Key, color: "text-nvidia-green" }] : []),
  ];
  const rowClass = "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.06] active:bg-foreground/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground";
  const itemVariants = {
    closed: { opacity: 0, y: -4, transition: { duration: reduceMotion ? 0 : 0.1 } },
    open: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.18 } },
  };

  return (
    <div ref={rootRef} className="shrink-0 lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (!open) onOpen();
          setOpen(!open);
        }}
        className={`sticker-sm flex h-11 w-11 cursor-pointer items-center justify-center text-foreground transition-colors hover:!bg-panel-hover focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-foreground ${open ? "!bg-panel-hover" : ""}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <motion.path
            initial={false}
            animate={{ d: open ? "M 6 6 L 18 18" : "M 4 8 L 20 8" }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.path
            initial={false}
            animate={{ d: open ? "M 6 18 L 18 6" : "M 4 16 L 20 16" }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </button>

      <motion.nav
        id={menuId}
        aria-label="Mobile navigation"
        aria-hidden={!open}
        inert={!open}
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          clipPath: open ? "inset(0% 0% 0% 0% round 16px)" : "inset(0% 0% 100% 100% round 16px)",
        }}
        transition={{ duration: reduceMotion ? 0 : open ? 0.28 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={`absolute right-0 top-full z-50 mt-3 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-panel ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <motion.div
          initial={false}
          animate={open ? "open" : "closed"}
          variants={{ open: { transition: { staggerChildren: reduceMotion ? 0 : 0.025 } }, closed: {} }}
          className="custom-scrollbar max-h-[calc(100dvh-6rem)] overflow-y-auto p-2"
        >
          {links.map(({ href, label, icon: Icon, color }) => (
            <motion.div key={href} variants={itemVariants}>
              <Link href={href} target={href === "/documentation" ? "_blank" : undefined} rel={href === "/documentation" ? "noopener noreferrer" : undefined} onClick={close} className={rowClass}>
                <Icon className={`h-[18px] w-[18px] shrink-0 ${color}`} strokeWidth={2} aria-hidden="true" />
                <span className="flex-1">{label}</span>
                {href === "/documentation" && <ArrowUpRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
              </Link>
            </motion.div>
          ))}
          <div className="mx-3 my-2 border-t border-border" />
          <motion.div variants={itemVariants}>
            <button type="button" onClick={toggleTheme} className={rowClass}>
              {theme === "dark" ? <Sun className="h-[18px] w-[18px] text-[#f5c518]" aria-hidden="true" /> : <Moon className="h-[18px] w-[18px] text-[#6366f1]" aria-hidden="true" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </motion.div>
          {onSidebarToggle && (
            <motion.div variants={itemVariants}>
              <button type="button" onClick={() => { close(); onSidebarToggle(); }} className={rowClass}>
                <Sidebar className="h-[18px] w-[18px] text-[#5b6cff]" aria-hidden="true" />
                Sidebar
              </button>
            </motion.div>
          )}
          <motion.div variants={itemVariants}>
            <button type="button" onClick={() => { close(); clearChat(); }} className={rowClass}>
              <RefreshCw className="h-[18px] w-[18px] text-[#14b8a6]" aria-hidden="true" />
              Clear chat
            </button>
          </motion.div>
          <motion.div variants={itemVariants}>
            {user ? (
              <button type="button" onClick={() => { close(); onLogout(); }} className={rowClass}>
                <LogOut className="h-[18px] w-[18px] text-[#a78bfa]" aria-hidden="true" />
                Log out
              </button>
            ) : (
              <Link href="/auth" onClick={close} className={rowClass}>
                <LogIn className="h-[18px] w-[18px] text-nvidia-green" aria-hidden="true" />
                Log in
              </Link>
            )}
          </motion.div>
        </motion.div>
      </motion.nav>
    </div>
  );
}
