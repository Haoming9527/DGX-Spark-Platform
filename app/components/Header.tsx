"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronDown, Check, Loader2, RefreshCw } from "lucide-react";
import { ModelItem } from "../types/chat";

interface HeaderProps {
  models: ModelItem[];
  selectedModel: string;
  modelsLoading: boolean;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  setSelectedModel: (id: string) => void;
  clearChat: () => void;
}

export function Header({
  models,
  selectedModel,
  modelsLoading,
  isDropdownOpen,
  setIsDropdownOpen,
  setSelectedModel,
  clearChat,
}: HeaderProps) {
  return (
    <header className="flex-none p-4 md:px-8 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-nvidia-green/10 flex items-center justify-center border border-nvidia-green/20 shadow-[0_0_15px_rgba(118,185,0,0.15)] overflow-hidden p-1">
          <Image src="/logo.svg" alt="DGX Spark Logo" width={40} height={40} className="w-full h-full object-contain" priority />
        </div>
        <h1 className="text-xl font-bold tracking-tight hidden sm:block">
          DGX Spark<span className="text-nvidia-green"> Platform</span>
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={clearChat}
          className="p-2 text-foreground/40 hover:text-foreground transition-colors"
          title="Clear Chat"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        <div className="relative">
          <button
            onClick={() => !modelsLoading && setIsDropdownOpen(!isDropdownOpen)}
            disabled={modelsLoading}
            className="flex items-center gap-2 px-4 py-2 bg-panel rounded-lg border border-border hover:border-nvidia-green/50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {modelsLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-nvidia-green" /> Loading Models...
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-nvidia-green animate-pulse shadow-[0_0_8px_#76b900]" />
                {models.find((m) => m.id === selectedModel)?.name || "Select Model"}
                <ChevronDown
                  className={`w-4 h-4 text-foreground/40 transition-transform ${
                    isDropdownOpen ? "rotate-180" : ""
                  }`}
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
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
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
