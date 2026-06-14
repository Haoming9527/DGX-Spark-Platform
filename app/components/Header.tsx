"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Check, Loader2, RefreshCw, Key, LogOut, Menu, BookOpen, LogIn } from "lucide-react";
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
  return (
    <header className="flex-none px-3 sm:px-4 py-2 sm:py-3 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-[100] flex items-center justify-between gap-2 font-sans">
      <div className="flex items-center gap-2.5">
        {onSidebarToggle && (
          <button
            onClick={onSidebarToggle}
            className="p-1.5 rounded-lg hover:bg-panel-hover text-foreground/60 hover:text-foreground transition-colors cursor-pointer mr-0.5"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-nvidia-green/10 flex items-center justify-center border border-nvidia-green/20 shadow-[0_0_12px_rgba(118,185,0,0.12)] overflow-hidden p-0.5">
            <Image src="/logo.svg" alt="DGX Spark Logo" width={36} height={36} className="w-full h-full object-contain" priority />
          </div>
          <h1 className="text-base sm:text-lg font-bold tracking-tight hidden sm:block">
            DGX Spark<span className="text-nvidia-green"> Platform</span>
          </h1>
        </Link>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-3">
        <Link
          href="/documentation"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 items-center gap-2 px-2.5 sm:px-3 bg-panel hover:bg-panel-hover border border-border hover:border-nvidia-green/50 rounded-lg text-sm font-semibold transition-colors"
          title="Documentation"
        >
          <BookOpen className="w-4 h-4 text-nvidia-green" />
        </Link>

        {/* User Account / Auth controls */}
        {user ? (
          <div className="flex items-center gap-2">
            {/* API Keys — navigates to /apikeys page */}
            <Link
              href="/apikeys/manage"
              className="flex h-9 items-center gap-2 px-2.5 sm:px-3 bg-panel hover:bg-panel-hover border border-border hover:border-nvidia-green/50 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
              title="Manage API Keys"
            >
              <Key className="w-4 h-4 text-nvidia-green" />
              <span>API</span>
            </Link>
            <button
              onClick={onLogout}
              className="flex items-center justify-center w-9 h-9 bg-panel border border-border rounded-lg text-foreground hover:text-red-500 hover:border-red-500/50 transition-all shadow-sm cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/auth"
            className="flex h-9 items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 bg-nvidia-green/10 hover:bg-nvidia-green/20 border border-nvidia-green/30 hover:border-nvidia-green/50 rounded-lg text-nvidia-green text-xs sm:text-sm font-bold transition-colors cursor-pointer"
            title="Log in"
          >
            <LogIn className="w-4 h-4" />
            <span>Login</span>
          </Link>
        )}

        <button
          onClick={clearChat}
          className="flex items-center justify-center w-9 h-9 shrink-0 bg-panel border border-border rounded-lg text-foreground hover:text-nvidia-green hover:border-nvidia-green/50 transition-all shadow-sm cursor-pointer"
          title="Clear Chat"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => !modelsLoading && setIsDropdownOpen(!isDropdownOpen)}
            disabled={modelsLoading}
            className="flex h-9 w-28 sm:w-auto sm:max-w-56 items-center gap-2 px-3 sm:px-4 bg-panel rounded-lg border border-border hover:border-nvidia-green/50 transition-colors text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            {modelsLoading ? (
              <>
                <Loader2 className="w-4 h-4 shrink-0 animate-spin text-nvidia-green" />
                <span className="hidden sm:inline">Loading Models...</span>
                <span className="sm:hidden">Models</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 shrink-0 rounded-full bg-nvidia-green animate-pulse shadow-[0_0_8px_#76b900]" />
                <span className="min-w-0 truncate">{models.find((m) => m.id === selectedModel)?.name || "Select Model"}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-foreground/40 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                />
              </>
            )}
          </button>

          <AnimatePresence>
            {isDropdownOpen && !modelsLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-56 bg-panel border border-border rounded-xl shadow-2xl overflow-hidden z-50"
              >
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  <div className="text-[10px] font-bold text-foreground/40 px-5 py-3 uppercase tracking-widest sticky top-0 bg-panel z-10 border-b border-border/50">
                    Available Models
                  </div>
                  <div className="p-2 space-y-1">
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
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors text-left cursor-pointer ${
                          selectedModel === model.id
                            ? "bg-nvidia-green/10 text-nvidia-green"
                            : "hover:bg-panel-hover text-foreground/70"
                        }`}
                      >
                        <span className="truncate pr-2">{model.name}</span>
                        {selectedModel === model.id && <Check className="w-4 h-4 shrink-0" />}
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
