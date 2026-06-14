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

  return (
    <footer className="w-full max-w-4xl mx-auto absolute bottom-0 left-1/2 -translate-x-1/2 bg-gradient-to-t from-background via-background/90 to-transparent px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6 sm:p-4 sm:pt-10 pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        <form
          onSubmit={handleSubmit}
          className="relative flex flex-col gap-1.5 sm:gap-2 bg-panel border border-border p-2 rounded-2xl shadow-lg focus-within:ring-1 focus-within:ring-nvidia-green/50 transition-all font-sans"
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
            placeholder={isListening ? "Listening..." : "Send a message to DGX Spark..."}
            className={`w-full max-h-32 sm:max-h-48 min-h-11 sm:min-h-[52px] bg-transparent resize-none outline-none text-sm sm:text-base text-foreground py-2 px-3 ${isListening ? "text-nvidia-green/80" : ""}`}
            rows={1}
            readOnly={isListening}
          />
          
          <div className="flex items-center justify-between gap-2 pb-1 px-1">
            <div className="flex min-w-0 items-center gap-1.5 font-sans">

              
              <button
                type="button"
                onClick={() => setUseReasoning(!useReasoning)}
                className={`flex h-8 items-center gap-1.5 px-2.5 sm:px-3 rounded-full text-xs font-medium transition-colors border ${
                  useReasoning 
                  ? "bg-purple-500/10 text-purple-400 border-purple-500/30" 
                  : "bg-background text-foreground/50 border-border hover:bg-panel-hover"
                }`}
                title="Toggle Reasoning Mode"
              >
                <BrainCircuit className="w-3.5 h-3.5" />
                <span className="hidden min-[380px]:inline">Thinking</span>
              </button>

              <button
                type="button"
                onClick={toggleListening}
                className={`flex h-8 items-center gap-1.5 px-2.5 sm:px-3 rounded-full text-xs font-medium transition-colors border relative ${
                  isListening 
                  ? "bg-red-500/10 text-red-500 border-red-500/30" 
                  : "bg-background text-foreground/50 border-border hover:bg-panel-hover"
                }`}
                title={isListening ? "Stop Recording" : "Voice Input"}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" />
                    <span className="hidden min-[380px]:inline">Recording...</span>
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
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
                  className="h-10 w-10 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors flex items-center justify-center"
                  title="Stop generation"
                >
                  <StopCircle className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || !selectedModel}
                  className="h-10 w-10 rounded-xl bg-nvidia-green text-background hover:bg-nvidia-green-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_15px_rgba(118,185,0,0.3)] flex items-center justify-center"
                  title="Send Message"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </form>
        <div className="hidden sm:block text-center text-xs text-foreground/40 pb-2 opacity-70 hover:opacity-100 transition-all duration-300">
           <span className="text-nvidia-green font-semibold">Chat won&apos;t be saved</span>
           <span className="mx-2 text-foreground/20">•</span>
           LLMs running on private Nvidia DGX Spark
           <span className="mx-2 text-foreground/20">•</span>
           <a 
             href="https://github.com/Haoming9527/DGX-Spark-Platform" 
             target="_blank" 
             rel="noopener noreferrer"
             className="hover:text-nvidia-green transition-colors underline decoration-foreground/20 underline-offset-2"
           >
             View Git Repo
           </a>
        </div>
      </div>
    </footer>
  );
}
