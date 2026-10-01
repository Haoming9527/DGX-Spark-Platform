"use client";

import { useState } from "react";
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
  Shield,
  Power,
} from "lucide-react";
import { ModelItem } from "../types/chat";
import { LogoMark } from "./ui/LogoMark";
import { ModelLabel } from "./ui/ModelBrand";
import { ThemeToggle } from "./ui/ThemeToggle";
import { MobileHeaderMenu } from "./MobileHeaderMenu";

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
  user: { id: string; username: string; email: string; role?: string } | null;
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
  onAuthClick,
  onLogout,
  onSidebarToggle,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    <header className="sticky top-0 z-[100] flex min-h-[3.75rem] flex-none px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] font-sans sm:px-4 lg:py-3">
      <div className="relative mx-auto flex w-full max-w-5xl items-center justify-between gap-2 lg:gap-3">
        <div className="flex shrink-0 items-center gap-2">
          {onSidebarToggle && (
            <button
              onClick={onSidebarToggle}
              className="sticker-sm hidden h-9 w-9 cursor-pointer items-center justify-center transition-[filter] hover:brightness-110 lg:inline-flex"
              title="Toggle Sidebar"
            >
              <Menu className="h-4 w-4 text-[#5b6cff]" strokeWidth={2} />
            </button>
          )}
          <div className="flex h-11 w-11 items-center justify-center [&>a]:h-11 [&>a]:w-11 [&>a]:items-center [&>a]:justify-center lg:h-auto lg:w-auto lg:[&>a]:h-auto lg:[&>a]:w-auto">
            <LogoMark href="/" size={22} priority />
          </div>
          <Link
            href="/"
            className="sticker-sm hidden h-9 items-center px-3 transition-[filter] hover:brightness-110 lg:inline-flex"
          >
            <span className="font-display text-[14px] font-bold uppercase tracking-[0.04em]">
              DGX Spark
            </span>
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none">
          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle />

            {user?.role === "admin" && (
              <Link
                href="/admin/users"
                className="sticker-sm inline-flex h-9 w-9 items-center justify-center transition-[filter] hover:brightness-110"
                title="Admin"
              >
                <Shield className="h-4 w-4 text-nvidia-green" strokeWidth={2.25} />
              </Link>
            )}

            {user?.role === "operator" && (
              <Link
                href="/power"
                className="sticker-sm inline-flex h-9 w-9 items-center justify-center transition-[filter] hover:brightness-110 focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-foreground"
                title="Power"
                aria-label="Power"
              >
                <Power className="h-4 w-4 text-nvidia-green" strokeWidth={2.25} aria-hidden="true" />
              </Link>
            )}

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
              <button
                type="button"
                onClick={onAuthClick}
                aria-haspopup="dialog"
                className="sticker-sm sticker-cta inline-flex h-9 cursor-pointer items-center gap-1.5 px-3.5 text-[13px] font-semibold transition-[filter] hover:brightness-105"
                title="Log in"
              >
                <LogIn className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span>Login</span>
              </button>
            )}

            <button
              onClick={clearChat}
              className="sticker-sm inline-flex h-9 w-9 cursor-pointer items-center justify-center transition-[filter] hover:brightness-110"
              title="Clear Chat"
            >
              <RefreshCw className="h-4 w-4 text-[#14b8a6]" strokeWidth={2.25} />
            </button>
          </div>

          <div className="min-w-0 max-w-[11rem] flex-1 sm:max-w-[14rem] lg:relative lg:max-w-none lg:flex-none">
            <button
              onClick={() => {
                if (modelsLoading || modelUnavailable) return;
                setMobileMenuOpen(false);
                setIsDropdownOpen(!isDropdownOpen);
              }}
              disabled={modelsLoading || modelUnavailable}
              aria-label={`Select model: ${statusLabel || selectedModel || "No model selected"}`}
              aria-expanded={isDropdownOpen && !modelsLoading && !modelUnavailable}
              className="sticker-sm flex h-11 w-full cursor-pointer items-center justify-between gap-2 px-3 text-[13px] font-medium text-foreground transition-[filter] enabled:hover:brightness-110 focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-foreground disabled:cursor-not-allowed disabled:!bg-panel-hover disabled:!text-muted disabled:opacity-60 lg:h-9 lg:w-[16rem]"
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
                  className="sticker absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden !rounded-2xl lg:mt-2 lg:w-72"
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
                            className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors lg:min-h-0 ${
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
          <MobileHeaderMenu
            open={mobileMenuOpen}
            setOpen={setMobileMenuOpen}
            onOpen={() => setIsDropdownOpen(false)}
            user={user}
            clearChat={clearChat}
            onLogout={onLogout}
            onAuthClick={onAuthClick}
            onSidebarToggle={onSidebarToggle}
          />
        </div>
      </div>
    </header>
  );
}
