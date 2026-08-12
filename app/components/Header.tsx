"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Check, Loader2, RefreshCw, Key, LogOut, Menu, BookOpen, LogIn, Activity } from "lucide-react";
import { ModelItem } from "../types/chat";

interface HeaderProps {
  models: ModelItem[];
  selectedModel: string;
  modelsLoading: boolean;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  setSelectedModel: (id: string) => void;
  clearChat: () => void;
  user: { id: string; username: string; email: string } | null;
  onAuthClick: () => void;
  onLogout: () => void;
  onSidebarToggle?: () => void;
}

export function Header({
  models,
  selectedModel,
  modelsLoading,
  isDropdownOpen,
  setIsDropdownOpen,
  setSelectedModel,
  clearChat,
  user,
  onLogout,
  onSidebarToggle,
}: HeaderProps) {
  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground cursor-pointer";

  return (
    <header className="sticky top-0 z-[100] flex flex-none items-center justify-between gap-2 border-b border-border/70 bg-background/75 px-3 py-2.5 backdrop-blur-xl sm:px-4 font-sans">
      <div className="flex items-center gap-2">
        {onSidebarToggle && (
          <button onClick={onSidebarToggle} className={iconBtn} title="Toggle Sidebar">
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
        )}
        <Link href="/" className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <Image src="/logo.svg" alt="" width={28} height={28} className="h-7 w-7 object-contain" priority />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
            DGX Spark <span className="font-medium text-foreground/45">Platform</span>
          </span>
        </Link>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-1.5">
        <Link
          href="/status"
          className={iconBtn}
          title="Status"
        >
          <Activity className="h-4 w-4" strokeWidth={1.75} />
        </Link>

        <Link
          href="/documentation"
          target="_blank"
          rel="noopener noreferrer"
          className={iconBtn}
          title="Documentation"
        >
          <BookOpen className="h-4 w-4" strokeWidth={1.75} />
        </Link>

        {user ? (
          <>
            <Link
              href="/apikeys/manage"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-foreground/65 transition-colors hover:bg-foreground/[0.06] hover:text-foreground cursor-pointer"
              title="Manage API Keys"
            >
              <Key className="h-4 w-4 text-nvidia-green" strokeWidth={1.75} />
              <span className="hidden sm:inline">API</span>
            </Link>
            <button onClick={onLogout} className={iconBtn} title="Log Out">
              <LogOut className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </>
        ) : (
          <Link
            href="/auth"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-nvidia-green px-3.5 text-[13px] font-semibold text-black transition-opacity hover:opacity-90 cursor-pointer"
            title="Log in"
          >
            <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Login</span>
          </Link>
        )}

        <button onClick={clearChat} className={iconBtn} title="Clear Chat">
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
        </button>

        <div className="relative">
          <button
            onClick={() => !modelsLoading && setIsDropdownOpen(!isDropdownOpen)}
            disabled={modelsLoading}
            className="flex h-9 max-w-[9.5rem] items-center gap-2 rounded-full bg-foreground/[0.04] px-3 text-[13px] font-medium text-foreground/80 ring-1 ring-border/80 transition-colors hover:bg-foreground/[0.07] disabled:opacity-50 sm:max-w-52 cursor-pointer"
          >
            {modelsLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-nvidia-green" />
                <span className="truncate">Models</span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nvidia-green" />
                <span className="min-w-0 truncate">
                  {models.find((m) => m.id === selectedModel)?.name || "Select Model"}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-foreground/35 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                />
              </>
            )}
          </button>

          <AnimatePresence>
            {isDropdownOpen && !modelsLoading && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl bg-panel shadow-xl ring-1 ring-border/80"
              >
                <div className="max-h-64 overflow-y-auto">
                  <div className="sticky top-0 z-10 border-b border-border/60 bg-panel px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-foreground/40">
                    Models
                  </div>
                  <div className="p-1.5">
                    {models.length === 0 && (
                      <div className="px-3 py-2 text-sm text-foreground/40">No models found</div>
                    )}
                    {models.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id);
                          setIsDropdownOpen(false);
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                          selectedModel === model.id
                            ? "bg-nvidia-green/10 text-nvidia-green"
                            : "text-foreground/75 hover:bg-foreground/[0.05]"
                        }`}
                      >
                        <span className="truncate pr-2">{model.name}</span>
                        {selectedModel === model.id && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
