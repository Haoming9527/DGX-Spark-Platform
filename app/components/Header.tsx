"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ChevronDown,
  Check,
  RefreshCw,
  Key,
  LogOut,
  Menu,
  BookOpen,
  LogIn,
  Activity,
} from "lucide-react";
import { ModelItem } from "../types/chat";
import { LogoMark } from "./ui/LogoMark";
import { ModelLabel } from "./ui/ModelBrand";
import { ThemeToggle } from "./ui/ThemeToggle";

interface HeaderProps {
  models: ModelItem[];
  selectedModel: string;
  modelsLoading: boolean;
  isOffline?: boolean;
  isSleeping?: boolean;
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
  isOffline = false,
  isSleeping = false,
  isDropdownOpen,
  setIsDropdownOpen,
  setSelectedModel,
  clearChat,
  user,
  onLogout,
  onSidebarToggle,
}: HeaderProps) {
  const selected = models.find((m) => m.id === selectedModel);
  const hasModel = Boolean(selected);
  const modelUnavailable = isOffline || isSleeping || (!modelsLoading && models.length === 0);

  const statusLabel = modelsLoading
    ? "Models"
    : isOffline
      ? "Offline"
      : isSleeping
        ? "Sleeping"
        : models.length === 0
          ? "No models"
          : null;

  const ledState = modelsLoading
    ? "idle"
    : isOffline
      ? "bad"
      : isSleeping
        ? "warn"
        : hasModel
          ? "ok"
          : "idle";

  return (
    <header className="sticky top-0 z-[100] flex flex-none px-3 py-3 sm:px-4 font-sans">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {onSidebarToggle && (
            <button
              onClick={onSidebarToggle}
              className="sticker-sm inline-flex h-9 w-9 cursor-pointer items-center justify-center transition-[filter] hover:brightness-110"
              title="Toggle Sidebar"
            >
              <Menu className="h-4 w-4 text-[#5b6cff]" strokeWidth={2} />
            </button>
          )}
          <LogoMark href="/" size={22} />
          <Link
            href="/"
            className="sticker-sm hidden h-9 items-center px-3 transition-[filter] hover:brightness-110 sm:inline-flex"
          >
            <span className="font-display text-[14px] font-bold uppercase tracking-[0.04em]">
              DGX Spark
            </span>
          </Link>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <ThemeToggle />

          <Link
            href="/status"
            className="sticker-sm inline-flex h-9 w-9 items-center justify-center transition-[filter] hover:brightness-110"
            title="Status"
          >
            <Activity className="h-4 w-4 text-[#ff5c5c]" strokeWidth={2.25} />
          </Link>

          <Link
            href="/documentation"
            target="_blank"
            rel="noopener noreferrer"
            className="sticker-sm inline-flex h-9 w-9 items-center justify-center transition-[filter] hover:brightness-110"
            title="Documentation"
          >
            <BookOpen className="h-4 w-4 text-[#3b82f6]" strokeWidth={2.25} />
          </Link>

          {user ? (
            <>
              <Link
                href="/apikeys/manage"
                className="sticker-sm inline-flex h-9 cursor-pointer items-center gap-1.5 px-3 text-[13px] font-semibold transition-[filter] hover:brightness-110"
                title="Manage API Keys"
              >
                <Key className="h-4 w-4 text-nvidia-green" strokeWidth={2.25} />
                <span className="hidden text-foreground sm:inline">API</span>
              </Link>
              <button
                onClick={onLogout}
                className="sticker-sm inline-flex h-9 w-9 cursor-pointer items-center justify-center transition-[filter] hover:brightness-110"
                title="Log Out"
              >
                <LogOut className="h-4 w-4 text-[#a78bfa]" strokeWidth={2.25} />
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="sticker-sm sticker-cta inline-flex h-9 cursor-pointer items-center gap-1.5 px-3.5 text-[13px] font-semibold transition-[filter] hover:brightness-105"
              title="Log in"
            >
              <LogIn className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span>Login</span>
            </Link>
          )}

          <button
            onClick={clearChat}
            className="sticker-sm inline-flex h-9 w-9 cursor-pointer items-center justify-center transition-[filter] hover:brightness-110"
            title="Clear Chat"
          >
            <RefreshCw className="h-4 w-4 text-[#14b8a6]" strokeWidth={2.25} />
          </button>

          <div className="relative">
            <button
              onClick={() => !modelsLoading && !modelUnavailable && setIsDropdownOpen(!isDropdownOpen)}
              disabled={modelsLoading || modelUnavailable}
              className="sticker-sm flex h-9 max-w-[11.5rem] cursor-pointer items-center gap-2 px-2.5 text-[13px] font-medium text-foreground transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-[16rem] sm:px-3"
              title={statusLabel || selectedModel || "Select model"}
            >
              {modelsLoading ? (
                <>
                  <span className="inline-flex items-center gap-1" aria-hidden>
                    <span className="sticker-pulse" />
                    <span className="sticker-pulse sticker-pulse-delay-1" />
                    <span className="sticker-pulse sticker-pulse-delay-2" />
                  </span>
                  <span className="truncate">{statusLabel}</span>
                </>
              ) : statusLabel ? (
                <>
                  <span
                    className={`status-led ${
                      ledState === "ok"
                        ? "status-led-ok"
                        : ledState === "warn"
                          ? "status-led-warn"
                          : ledState === "bad"
                            ? "status-led-bad"
                            : "status-led-idle"
                    }`}
                  />
                  <span className="truncate text-xs">{statusLabel}</span>
                </>
              ) : (
                <>
                  <ModelLabel
                    modelId={selectedModel}
                    parameterSize={selected?.parameterSize}
                    compact
                    className="min-w-0 text-xs"
                  />
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                    strokeWidth={2.25}
                  />
                </>
              )}
            </button>

            <AnimatePresence>
              {isDropdownOpen && !modelsLoading && !modelUnavailable && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="sticker absolute right-0 top-full z-50 mt-2 w-[17.5rem] overflow-hidden !rounded-2xl sm:w-72"
                >
                  <div className="custom-scrollbar max-h-72 overflow-y-auto">
                    <div className="sticky top-0 z-10 border-b border-border bg-panel px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-wider text-muted">
                      Models
                    </div>
                    <div className="p-1.5">
                      {models.map((model) => {
                        const active = selectedModel === model.id;
                        return (
                          <button
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model.id);
                              setIsDropdownOpen(false);
                            }}
                            className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${
                              active
                                ? "bg-nvidia-green/10"
                                : "hover:bg-foreground/[0.05]"
                            }`}
                          >
                            <ModelLabel
                              modelId={model.id}
                              parameterSize={model.parameterSize}
                              className="min-w-0 flex-1 text-[13px]"
                            />
                            {active && (
                              <Check className="h-4 w-4 shrink-0 text-nvidia-green" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
