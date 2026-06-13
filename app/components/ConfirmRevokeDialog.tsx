"use client";

import { motion } from "framer-motion";
import { TriangleAlert, X, Loader2, Trash2 } from "lucide-react";

interface ConfirmRevokeDialogProps {
  keyName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export function ConfirmRevokeDialog({
  keyName,
  onConfirm,
  onCancel,
  loading,
}: ConfirmRevokeDialogProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <TriangleAlert className="w-4.5 h-4.5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Revoke API Key</h3>
              <p className="text-xs text-foreground/40 mt-0.5">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-foreground/30 hover:text-foreground/60 transition-colors p-1 rounded-lg hover:bg-panel-hover cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-foreground/70">
            You are about to permanently revoke{" "}
            <span className="font-semibold text-foreground">&quot;{keyName}&quot;</span>.
            Any application using this key will immediately lose access.
          </p>

          <div className="flex gap-2.5">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2 rounded-lg border border-border bg-panel-hover text-sm font-semibold text-foreground/70 hover:text-foreground hover:border-border/80 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Revoking…</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Revoke Key</>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
