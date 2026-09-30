"use client";

import { useState, useEffect, useRef, useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Send, StopCircle, BrainCircuit, Mic, MicOff, ImagePlus, Plus, X, ChevronDown, Globe, Plug } from "lucide-react";
import { ChatImage } from "../types/chat";
import Image from "next/image";
import type { ThinkingMode } from "@/lib/modelThinking";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type MicNotice = string;

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onend: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  start(): void;
  stop(): void;
  abort(): void;
}

interface ChatInputProps {
  input: string;
  setInput: (val: string | ((prev: string) => string)) => void;
  isLoading: boolean;
  selectedModel: string;
  handleSubmit: (e: React.FormEvent) => void;
  stopGeneration: () => void;
  useReasoning: boolean;
  setUseReasoning: (val: boolean) => void;
  useWebSearch: boolean;
  setUseWebSearch: (val: boolean) => void;
  onMcp: () => void;
  mcpCount: number;
  canThink: boolean;
  thinkingMode?: ThinkingMode;
  canSee: boolean;
  pendingImages: ChatImage[];
  setPendingImages: (val: ChatImage[] | ((prev: ChatImage[]) => ChatImage[])) => void;
  showJumpLatest?: boolean;
  onJumpLatest?: () => void;
}

interface CustomWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

export function ChatInput({
  input,
  setInput,
  isLoading,
  selectedModel,
  handleSubmit,
  stopGeneration,
  useReasoning,
  setUseReasoning,
  useWebSearch,
  setUseWebSearch,
  onMcp,
  mcpCount,
  canThink,
  thinkingMode,
  canSee,
  pendingImages,
  setPendingImages,
  showJumpLatest = false,
  onJumpLatest,
}: ChatInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [micNotice, setMicNotice] = useState<MicNotice | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsId = useId();
  const toolsToggleRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const micNoticeTimerRef = useRef<number | null>(null);

  const showMicNotice = (message: string) => {
    setMicNotice(message);
    if (micNoticeTimerRef.current) window.clearTimeout(micNoticeTimerRef.current);
    micNoticeTimerRef.current = window.setTimeout(() => {
      setMicNotice(null);
      micNoticeTimerRef.current = null;
    }, 4200);
  };

  useEffect(() => {
    return () => {
      if (micNoticeTimerRef.current) window.clearTimeout(micNoticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as unknown as CustomWindow;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let final = "";
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          
          if (final) {
            setInput((prev) => {
               const separator = prev.length > 0 && !prev.endsWith(" ") ? " " : "";
               return prev + separator + final.trim() + " ";
            });
            setInterimTranscript("");
          } else {
            setInterimTranscript(interim);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          setInterimTranscript("");
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          if (event.error === "no-speech" || event.error === "aborted" || event.error === "not-allowed") {
            setIsListening(false);
            setInterimTranscript("");
            return;
          }
          console.error("Speech recognition error:", event.error);
          setIsListening(false);
          setInterimTranscript("");
        };

        recognitionRef.current = recognition;
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [setInput]);

  const toggleListening = async () => {
    if (!recognitionRef.current) {
      showMicNotice("Voice isn’t supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimTranscript("");
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        showMicNotice("No microphone available.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setIsListening(false);
      setInterimTranscript("");
      showMicNotice("Allow the mic for this site, then try again.");
      return;
    }

    try {
      setInterimTranscript("");
      recognitionRef.current.start();
      setIsListening(true);
    } catch (err: unknown) {
      setIsListening(false);
      setInterimTranscript("");
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already started/i.test(msg)) {
        showMicNotice("Allow the mic for this site, then try again.");
      }
    }
  };

  const addImageFiles = async (files: Iterable<File>) => {
    if (!canSee) return;
    const candidates = Array.from(files).filter(
      (file) => file.type.startsWith("image/") && file.size > 0 && file.size <= MAX_IMAGE_BYTES
    );
    if (!candidates.length) return;

    const loaded: ChatImage[] = [];
    for (const file of candidates) {
      let dataUrl = "";
      try {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(file);
        });
      } catch {
        continue;
      }
      if (!dataUrl) continue;
      loaded.push({
        id: `${file.name || "paste"}-${file.size}-${file.lastModified || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name || "pasted-image.png",
        dataUrl,
      });
    }
    if (!loaded.length) return;
    setPendingImages((prev) => [...prev, ...loaded].slice(0, MAX_IMAGES));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (!canSee) return;
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    if (!files.length && e.clipboardData?.files?.length) {
      files.push(...Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")));
    }
    if (!files.length) return;
    e.preventDefault();
    void addImageFiles(files);
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (!canSee) return;
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!canSee) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!canSee) return;
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: React.DragEvent) => {
    if (!canSee) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    void addImageFiles(e.dataTransfer.files);
  };

  const chip =
    "sticker-sm relative inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted !shadow-[0_2px_4px_rgb(0_0_0/0.06)] transition-[filter,background-color,color,border-color] hover:brightness-110 hover:text-foreground focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-foreground @[600px]/composer:w-auto @[600px]/composer:px-3";
  const chipImageOn =
    "!border-[#2563eb]/55 !bg-[#2563eb]/20 !text-[#1d4ed8]";
  const chipThinkOn =
    "!border-[#d97706]/55 !bg-[#d97706]/20 !text-[#b45309]";
  const chipVoiceOn =
    "!border-alert/55 !bg-alert/15 !text-alert";
  const canSend = Boolean((input.trim() || pendingImages.length > 0) && selectedModel && !isLoading);
  const toolVariants = {
    closed: {
      opacity: 0,
      x: -8,
      transition: { duration: reduceMotion ? 0 : 0.12 },
    },
    open: (index: number) => ({
      opacity: 1,
      x: 0,
      transition: { duration: reduceMotion ? 0 : 0.24, delay: reduceMotion ? 0 : index * 0.035 },
    }),
  };

  return (
    <footer className="pointer-events-none absolute bottom-0 left-1/2 z-20 w-full max-w-3xl -translate-x-1/2 bg-gradient-to-t from-background via-background/90 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 sm:px-4 sm:pt-14">
      <div className="pointer-events-auto relative flex w-full flex-col gap-2.5">
        <AnimatePresence>
          {showJumpLatest && onJumpLatest ? (
            <motion.button
              type="button"
              key="jump-latest"
              onClick={onJumpLatest}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute -top-10 left-1/2 z-10 inline-flex h-7 w-7 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-panel text-foreground shadow-none hover:bg-panel-hover"
              title="Scroll to latest"
              aria-label="Scroll to latest message"
            >
              <ChevronDown className="h-3.5 w-3.5 text-nvidia-green" strokeWidth={2.5} />
            </motion.button>
          ) : null}
        </AnimatePresence>
        <form
          onSubmit={handleSubmit}
          onPaste={onPaste}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={`sticker @container/composer relative flex w-full flex-col gap-2 !rounded-[1.35rem] p-2.5 font-sans transition-[box-shadow,border-color] ${
            isDragging ? "!border-[#2563eb]/55 shadow-[0_0_0_3px_rgba(37,99,235,0.18)]" : ""
          }`}
        >
          {isDragging && canSee && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[1.35rem] bg-[#2563eb]/08 text-sm font-medium text-[#1d4ed8]">
              Drop images to attach
            </div>
          )}

          {pendingImages.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1.5 pt-1">
              {pendingImages.map((img) => (
                <div key={img.id} className="relative h-14 w-14 overflow-hidden rounded-xl ring-1 ring-border">
                  <Image src={img.dataUrl} alt={img.name} fill unoptimized sizes="56px" className="object-cover" />
                  <button
                    type="button"
                    onClick={() => setPendingImages((prev) => prev.filter((p) => p.id !== img.id))}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                    title="Remove image"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={input + (interimTranscript ? (input.endsWith(" ") ? "" : " ") + interimTranscript : "")}
            onChange={(e) => {
              if (!isListening) {
                setInput(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={
              isListening
                ? "Listening…"
                : canSee
                  ? "Message DGX Spark…"
                  : "Message DGX Spark…"
            }
            className={`max-h-40 min-h-[48px] w-full resize-none bg-transparent px-3.5 py-2.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted sm:max-h-52 ${isListening ? "text-nvidia-green/90" : ""}`}
            rows={1}
            readOnly={isListening}
          />

          <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
            <div
              className="flex min-w-0 flex-1 items-center"
              onKeyDown={(event) => {
                if (event.key === "Escape" && toolsOpen) {
                  event.preventDefault();
                  setToolsOpen(false);
                  toolsToggleRef.current?.focus();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => void addImageFiles(e.target.files || [])}
              />
              <button
                ref={toolsToggleRef}
                type="button"
                onClick={() => setToolsOpen((open) => !open)}
                aria-expanded={toolsOpen}
                aria-controls={toolsId}
                aria-label={`${toolsOpen ? "Hide" : "Show"} tools${isListening ? "; voice recording active" : ""}`}
                title={toolsOpen ? "Hide tools" : "Show tools"}
                className={`sticker-sm relative z-10 flex h-10 w-10 shrink-0 items-center justify-center transition-colors duration-200 hover:!bg-panel-hover hover:text-foreground focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-foreground ${toolsOpen ? "!bg-panel-hover text-foreground" : "text-muted"}`}
              >
                <motion.span
                  initial={false}
                  animate={{ rotate: toolsOpen ? 45 : 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center justify-center"
                >
                  <Plus className="h-5 w-5" strokeWidth={1.8} />
                </motion.span>
                {!toolsOpen && (mcpCount > 0 || useWebSearch || isListening || pendingImages.length > 0 || (canThink && useReasoning)) && (
                  <span
                    aria-hidden="true"
                    className={`absolute right-0 top-0 h-2 w-2 rounded-full ring-2 ring-panel ${isListening ? "bg-alert" : "bg-nvidia-green"}`}
                  />
                )}
              </button>

              <motion.div
                id={toolsId}
                initial={false}
                animate={{ width: toolsOpen ? "auto" : 0 }}
                transition={{ duration: reduceMotion ? 0 : toolsOpen ? 0.32 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden={!toolsOpen}
                inert={!toolsOpen}
                className="custom-scrollbar min-w-0 overflow-x-auto"
              >
                <motion.div
                  initial={false}
                  animate={toolsOpen ? "open" : "closed"}
                  className="flex w-max items-center gap-1.5 py-1.5 pl-2.5 pr-1.5"
                >
                  <motion.div variants={toolVariants} custom={0} className="flex">
                    <button
                      type="button"
                      disabled={!canSee}
                      onClick={() => canSee && fileInputRef.current?.click()}
                      aria-disabled={!canSee}
                      aria-label="Attach images"
                      className={`${chip} ${
                        !canSee
                          ? "cursor-not-allowed opacity-35 hover:brightness-100 hover:text-muted"
                          : pendingImages.length > 0
                            ? chipImageOn
                            : ""
                      }`}
                      title={canSee ? "Attach images" : "This model does not accept images"}
                    >
                      <ImagePlus className="h-3.5 w-3.5" strokeWidth={2} />
                      <span className="hidden @[600px]/composer:inline">Image</span>
                    </button>
                  </motion.div>

                  <motion.div variants={toolVariants} custom={1} className="flex">
                    <button
                      type="button"
                      disabled={!canThink}
                      onClick={() => canThink && setUseReasoning(!useReasoning)}
                      aria-pressed={canThink && useReasoning}
                      aria-disabled={!canThink}
                      aria-label={useReasoning ? "Thinking: deeper research" : "Thinking: light and fast"}
                      className={`${chip} ${
                        !canThink
                          ? "cursor-not-allowed opacity-35 hover:brightness-100 hover:text-muted"
                          : useReasoning
                            ? chipThinkOn
                            : ""
                      }`}
                      title={!canThink ? "Choose a model with thinking or tool support." : `${useReasoning ? "Deeper thinking and research. Click for a lighter, faster response." : "Light and fast. Click for deeper thinking and research."}${thinkingMode === "required" ? " This model still reasons in light mode." : ""}`}
                    >
                      <BrainCircuit className="h-3.5 w-3.5" strokeWidth={2} />
                      <span className="hidden @[600px]/composer:inline">Thinking</span>
                    </button>
                  </motion.div>

                  <motion.div variants={toolVariants} custom={2} className="flex">
                    <button
                      type="button"
                      onClick={() => setUseWebSearch(!useWebSearch)}
                      aria-pressed={useWebSearch}
                      aria-label="Force web search"
                      className={`${chip} ${useWebSearch ? "!border-nvidia-green/50 !bg-nvidia-green/15 !text-foreground" : ""}`}
                      title={useWebSearch ? "Web search required for this message" : "Auto search is available; click to require a web search"}
                    >
                      <Globe className="h-3.5 w-3.5" strokeWidth={2} />
                      <span className="hidden @[600px]/composer:inline">Search</span>
                    </button>
                  </motion.div>

                  <motion.div variants={toolVariants} custom={3} className="flex">
                    <button type="button" onClick={onMcp} aria-label={`MCP connections${mcpCount ? `, ${mcpCount} selected` : ""}`} aria-haspopup="dialog" title="Connect MCP tools"
                      className={`${chip} ${mcpCount ? "!border-nvidia-green/50 !bg-nvidia-green/15 !text-foreground" : ""}`}>
                      <Plug className="h-3.5 w-3.5" strokeWidth={2} />
                      <span className="hidden @[600px]/composer:inline">MCP{mcpCount ? ` (${mcpCount})` : ""}</span>
                    </button>
                  </motion.div>

                  <motion.div variants={toolVariants} custom={4} className="flex">
                    <button
                      type="button"
                      onClick={() => void toggleListening()}
                      aria-pressed={isListening}
                      aria-label={isListening ? "Stop recording" : "Voice input"}
                      className={`${chip} ${isListening ? chipVoiceOn : ""}`}
                      title={isListening ? "Stop Recording" : "Voice Input"}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="h-3.5 w-3.5" strokeWidth={2} />
                          <span className="hidden @[600px]/composer:inline">Recording</span>
                          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-alert opacity-75 motion-reduce:animate-none" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-alert" />
                          </span>
                        </>
                      ) : (
                        <>
                          <Mic className="h-3.5 w-3.5" strokeWidth={2} />
                          <span className="hidden @[600px]/composer:inline">Voice</span>
                        </>
                      )}
                    </button>
                  </motion.div>
                </motion.div>
              </motion.div>

              <AnimatePresence>
                {micNotice && (
                  <motion.p
                    key={micNotice}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="min-w-0 truncate text-[11px] leading-none text-[#e11d48]/90 sm:text-[12px]"
                    role="status"
                  >
                    {micNotice}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {isLoading ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="sticker-sm flex h-10 w-10 cursor-pointer items-center justify-center !border-foreground/30 !bg-panel !text-foreground transition-[background-color,border-color] duration-150 hover:!border-foreground/55 hover:!bg-[color-mix(in_srgb,var(--foreground)_12%,var(--panel))] focus-visible:!outline-2 focus-visible:!outline-offset-2 focus-visible:!outline-foreground motion-reduce:transition-none"
                  title="Stop generation"
                  aria-label="Stop generation"
                >
                  <StopCircle className="h-4 w-4" strokeWidth={2} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  className="sticker-sm sticker-cta flex h-10 w-10 items-center justify-center transition-[filter] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exit disabled:cursor-not-allowed disabled:opacity-35"
                  title="Send Message"
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </form>
        <div className="hidden pb-1 text-center text-[11px] text-muted sm:block">
          <span>Chat isn&apos;t saved</span>
          <span className="mx-1.5 opacity-40">·</span>
          Not affiliated with NVIDIA
          <span className="mx-1.5 opacity-40">·</span>
          <a
            href="https://github.com/Haoming9527/DGX-Spark-Platform"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
