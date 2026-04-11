"use client";

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import Image from "next/image";

interface OfflineStateProps {
  onRetry: () => void;
}

export function OfflineState({ onRetry }: OfflineStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-24 h-24 rounded-3xl bg-panel border border-border flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(118,185,0,0.1)] relative overflow-hidden"
      >
        <Image 
          src="/logo.svg" 
          alt="DGX Spark Logo" 
          width={40} 
          height={40} 
          className="w-10 h-10 object-contain opacity-20 grayscale" 
        />
        <div className="absolute inset-0 bg-nvidia-green/10 rounded-full blur-2xl opacity-40" />
        <div className="absolute inset-0 border border-nvidia-green/10 rounded-3xl pointer-events-none" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-3xl font-bold tracking-tight mb-4">
          DGX Spark is <span className="text-nvidia-green">Resting</span>
        </h2>
        
        <p className="text-foreground/50 max-w-sm mx-auto mb-10 leading-relaxed text-sm">
          To maintain absolute privacy and save energy on the private Nvidia DGX hardware, this platform is currently offline. Your local intelligence will be back online soon!
        </p>

        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2.5 px-6 py-3 bg-nvidia-green/5 hover:bg-nvidia-green/10 border border-nvidia-green/20 rounded-xl transition-all text-sm font-semibold text-nvidia-green group shadow-lg shadow-nvidia-green/5"
        >
          <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700 ease-in-out" />
          Wake Up Check
        </button>
      </motion.div>
      
      <div className="mt-12 text-[10px] font-mono text-foreground/20 uppercase tracking-[0.2em]">
        api.dgxspark.dev • Cloudflare Tunnel Status: Paused
      </div>
    </div>
  );
}
