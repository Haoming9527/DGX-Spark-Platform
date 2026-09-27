"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, TriangleAlert, X } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!loading) onCancel();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.18 }}
            className="sticker w-full max-w-sm overflow-hidden !rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 pb-0">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                    danger
                      ? "border-red-500/20 bg-red-500/10"
                      : "border-nvidia-green/20 bg-nvidia-green/10"
                  }`}
                >
                  <TriangleAlert className={`h-4 w-4 ${danger ? "text-red-400" : "text-nvidia-green"}`} />
                </div>
                <h3 id="admin-confirm-title" className="text-sm font-bold">
                  {title}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="rounded-lg p-1 text-muted hover:bg-panel-hover hover:text-foreground disabled:opacity-50"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-muted">{body}</p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={loading}
                  className="sticker-sm flex-1 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={loading}
                  className={`sticker-sm flex flex-1 items-center justify-center gap-2 py-2 text-sm font-bold disabled:opacity-60 ${
                    danger ? "text-red-400" : "text-nvidia-green"
                  }`}
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
