"use client";

import { useState, useEffect, useRef } from "react";
import { Send, StopCircle, BrainCircuit, Mic, MicOff } from "lucide-react";

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
}: ChatInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as unknown as CustomWindow;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true; // Enabled for "live" feel
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
          if (event.error === "no-speech") {
            // "no-speech" is a common timeout when the user doesn't say anything. 
            // We'll just reset without logging a scary error.
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

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        setInterimTranscript("");
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err: unknown) {
        console.error("Failed to start speech recognition:", err instanceof Error ? err.message : String(err));
      }
    }
  };

  const chip =
    "relative inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors sm:px-3";

  return (
    <footer className="pointer-events-none absolute bottom-0 left-1/2 w-full max-w-3xl -translate-x-1/2 bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8 sm:px-4 sm:pt-12">
      <div className="pointer-events-auto flex flex-col gap-2.5">
        <form
          onSubmit={handleSubmit}
          className="relative flex flex-col gap-2 rounded-[28px] bg-panel p-2.5 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-border/60 transition-[box-shadow] focus-within:shadow-[0_0_0_1px_rgba(118,185,0,0.25),0_8px_30px_rgba(0,0,0,0.14)] font-sans dark:shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_40px_rgba(0,0,0,0.45)]"
        >
          <textarea
            value={input + (interimTranscript ? (input.endsWith(" ") ? "" : " ") + interimTranscript : "")}
            onChange={(e) => {
              if (!isListening) {
                setInput(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={isListening ? "Listening…" : "Message DGX Spark…"}
            className={`max-h-40 min-h-[52px] w-full resize-none bg-transparent px-3.5 py-2.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-foreground/35 sm:max-h-52 ${isListening ? "text-nvidia-green/90" : ""}`}
            rows={1}
            readOnly={isListening}
          />

          <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setUseReasoning(!useReasoning)}
                className={`${chip} ${
                  useReasoning
                    ? "bg-nvidia-green/12 text-nvidia-green ring-1 ring-nvidia-green/25"
                    : "text-foreground/50 ring-1 ring-border/80 hover:bg-foreground/[0.04] hover:text-foreground/75"
                }`}
                title="Toggle Reasoning Mode"
              >
                <BrainCircuit className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="hidden min-[380px]:inline">Thinking</span>
              </button>

              <button
                type="button"
                onClick={toggleListening}
                className={`${chip} ${
                  isListening
                    ? "bg-red-500/10 text-red-500 ring-1 ring-red-500/25"
                    : "text-foreground/50 ring-1 ring-border/80 hover:bg-foreground/[0.04] hover:text-foreground/75"
                }`}
                title={isListening ? "Stop Recording" : "Voice Input"}
              >
                {isListening ? (
                  <>
                    <MicOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="hidden min-[380px]:inline">Recording</span>
                    <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="hidden min-[380px]:inline">Voice</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isLoading ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
                  title="Stop generation"
                >
                  <StopCircle className="h-4 w-4" strokeWidth={1.75} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || !selectedModel}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-nvidia-green text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                  title="Send Message"
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </form>
        <div className="hidden pb-1 text-center text-[11px] text-foreground/35 sm:block">
          <span>Chat isn&apos;t saved</span>
          <span className="mx-1.5 text-foreground/20">·</span>
          Not affiliated with NVIDIA
          <span className="mx-1.5 text-foreground/20">·</span>
          <a
            href="https://github.com/Haoming9527/DGX-Spark-Platform"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-foreground/20 underline-offset-2 transition-colors hover:text-foreground/60"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
