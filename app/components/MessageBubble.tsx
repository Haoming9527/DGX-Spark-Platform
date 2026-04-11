"use client";

import { motion } from "framer-motion";
import { Bot, User, BrainCircuit, Clock, Zap, Loader2 } from "lucide-react";
import { Message } from "../types/chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 sm:gap-6 w-full ${
        message.role === "user" ? "flex-row-reverse" : "flex-row"
      }`}
    >
      {/* Avatar */}
      <div className="flex-none w-8 sm:w-10">
        {message.role === "assistant" ? (
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-nvidia-green/10 flex items-center justify-center border border-nvidia-green/30 text-nvidia-green shadow-[0_0_10px_rgba(118,185,0,0.15)]">
            <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        ) : (
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-panel flex items-center justify-center border border-border">
            <User className="w-5 h-5 sm:w-6 sm:h-6 text-foreground/40" />
          </div>
        )}
      </div>

      {/* Message Content Container */}
      <div className={`flex flex-col gap-2 min-w-0 max-w-[calc(100%-3rem)] sm:max-w-[85%] ${message.role === "user" ? "items-end" : "items-start"}`}>
        
        {/* Thought Process Dropdown (If Assistant has <think>) */}
        {message.role === "assistant" && message.thoughtProcess && (
          <details className={`group w-full bg-panel border ${message.isThinking ? "border-nvidia-green/50 animate-pulse" : "border-border"} rounded-xl overflow-hidden`}>
            <summary className="flex items-center gap-2 px-4 py-2 cursor-pointer list-none text-sm font-medium text-foreground/50 hover:text-foreground hover:bg-panel-hover transition-colors select-none">
              <BrainCircuit className={`w-4 h-4 ${message.isThinking ? "text-nvidia-green animate-pulse" : ""}`} />
              {message.isThinking ? "Thinking Process..." : "View Thought Process"}
            </summary>
            <div className="px-4 py-3 border-t border-border bg-foreground/5 text-sm text-foreground/60 font-mono whitespace-pre-wrap">
              {message.thoughtProcess}
            </div>
          </details>
        )}

        {/* Main Bubble */}
        <div
          className={`w-full max-w-full px-4 py-2.5 overflow-x-auto rounded-2xl border ${
            message.role === "user"
              ? "bg-nvidia-green/10 border-nvidia-green/20 text-foreground rounded-tr-sm"
              : "bg-panel border-border text-foreground rounded-tl-sm shadow-sm"
          }`}
        >
          {message.content ? (
            <div className={`prose dark:prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ inline, className, children, ...props }: { 
                    inline?: boolean; 
                    className?: string; 
                    children?: React.ReactNode;
                  }) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <div className="overflow-hidden rounded-md my-4 border border-border">
                        <div className="bg-panel px-3 py-1.5 text-xs text-foreground/40 border-b border-border uppercase tracking-wider">
                          {match[1]}
                        </div>
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{ margin: 0, background: "#0d0d0d", padding: "1rem" }}
                          {...props}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <code className={`${className} bg-gray-800/50 px-1.5 py-0.5 rounded text-sm text-nvidia-green-light`} {...props}>
                        {children}
                      </code>
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-4 rounded-lg border border-border">
                         <table className="w-full text-sm text-left m-0">{children}</table>
                      </div>
                    )
                  },
                  thead({ children }) {
                    return <thead className="text-xs text-foreground/70 uppercase bg-foreground/5">{children}</thead>
                  },
                  th({ children }) {
                    return <th className="px-4 py-3 border-b border-border font-semibold">{children}</th>
                  },
                  td({ children }) {
                    return <td className="px-4 py-3 border-b border-border/50">{children}</td>
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            message.isThinking ? null : (
              <div className="flex items-center gap-2 text-nvidia-green">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Generating...</span>
              </div>
            )
          )}
        </div>
        
        {/* Performance metrics (If Assistant and finished) */}
        {message.role === "assistant" && message.evalCount && message.evalDurationMs && (
          <div className="flex items-center gap-4 text-xs font-mono text-gray-500 px-1 mt-1">
            <div className="flex items-center gap-1.5" title="Generation Time">
              <Clock className="w-3.5 h-3.5" />
              <span>{(message.evalDurationMs / 1000).toFixed(2)}s</span>
            </div>
            <div className="flex items-center gap-1.5" title="Tokens Generated">
              <Zap className="w-3.5 h-3.5" />
              <span>{message.evalCount} tokens</span>
            </div>
            <div className="flex items-center gap-1.5" title="Tokens per second">
              <span>{((message.evalCount / message.evalDurationMs) * 1000).toFixed(1)} t/s</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
