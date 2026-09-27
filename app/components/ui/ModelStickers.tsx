"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";

type ModelMark = {
  id: string;
  label: string;
  src?: string;
  ink?: boolean;
};

const MODELS: ModelMark[] = [
  { id: "llama", label: "Meta Llama", src: "/models/llama.svg" },
  { id: "mistral", label: "Mistral", src: "/models/mistral.svg" },
  { id: "nvidia", label: "NVIDIA Nemotron", src: "/models/nvidia.svg" },
  { id: "qwen", label: "Qwen", src: "/models/qwen.svg" },
  { id: "deepseek", label: "DeepSeek", src: "/models/deepseek.svg" },
  { id: "minimax", label: "MiniMax", src: "/models/minimax.svg" },
  { id: "gemma", label: "Gemma", src: "/models/gemma.svg" },
  { id: "kimi", label: "Kimi" },
  { id: "gpt-oss", label: "GPT-OSS", src: "/models/gpt-oss.svg", ink: true },
  { id: "zai", label: "Z.ai", src: "/models/zai.svg", ink: true },
];

function KimiGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M21.7202 0.939941C22.9502 0.939941 23.9502 1.93994 23.9502 3.16994C23.9502 4.39994 22.9502 5.39994 21.7202 5.39994H19.7502C19.6002 5.39994 19.4902 5.27994 19.4902 5.13994V3.16994C19.4902 1.93994 20.4902 0.939941 21.7202 0.939941Z"
        fill="#1783FF"
      />
      <path
        d="M9.39 13.9501L17.82 5.59012C17.98 5.43012 17.89 5.12012 17.68 5.12012H13.14C13.14 5.12012 13.04 5.14012 13 5.18012L3.92 14.1901C3.78 14.3301 3.57 14.2101 3.57 13.9801V5.39012C3.57 5.24012 3.47 5.12012 3.35 5.12012H0.219999C0.0999993 5.12012 0 5.24012 0 5.39012V23.9201C0 24.0701 0.0999993 24.1901 0.219999 24.1901H3.35C3.47 24.1901 3.57 24.0701 3.57 23.9201V20.1401C3.57 20.0601 3.6 19.9801 3.65 19.9301L6.47 17.1401C6.54 17.0701 6.63 17.0601 6.71 17.1101L14.24 22.6501C15.47 23.4801 16.85 23.9901 18.25 24.1401C18.37 24.1501 18.48 24.0301 18.48 23.8701V20.3101C18.48 20.1701 18.4 20.0601 18.29 20.0501C17.47 19.9201 16.66 19.6001 15.94 19.1101L9.42 14.3901C9.28 14.3001 9.27 14.0701 9.39 13.9501Z"
        fill="currentColor"
      />
    </svg>
  );
}

const ROTATES = [-8, 7, 5, -6, -4, 8, 6, -7, -5, 4] as const;

function parenthesesSeats(
  count: number,
  {
    leftX,
    rightX,
    amp,
    pad,
  }: {
    leftX: number;
    rightX: number;
    amp: number;
    pad: number;
  },
) {
  const perSide = Math.ceil(count / 2);
  const topMin = pad;
  const topMax = 100 - pad;
  return Array.from({ length: count }, (_, i) => {
    const onLeft = i % 2 === 0;
    const rail = Math.floor(i / 2);
    const t = perSide <= 1 ? 0.5 : rail / (perSide - 1);
    const bulge = Math.sin(Math.PI * t) * amp;
    const left = onLeft ? leftX - bulge : rightX + bulge;
    const top = topMin + t * (topMax - topMin) + (onLeft ? 0 : 1.2);
    return {
      left: `${+left.toFixed(1)}%`,
      top: `${+top.toFixed(1)}%`,
      rotate: ROTATES[i % ROTATES.length],
    };
  });
}

const IDLE_DESKTOP = parenthesesSeats(MODELS.length, {
  leftX: 30,
  rightX: 70,
  amp: 2.5,
  pad: 14,
});

const IDLE_LAPTOP = parenthesesSeats(MODELS.length, {
  leftX: 22,
  rightX: 78,
  amp: 2,
  pad: 15,
});

const IDLE_MOBILE = parenthesesSeats(MODELS.length, {
  leftX: 16,
  rightX: 84,
  amp: 2.5,
  pad: 14,
});

type Viewport = "mobile" | "laptop" | "desktop";

function subscribeViewport(onChange: () => void) {
  const mobile = window.matchMedia("(max-width: 639px)");
  const laptop = window.matchMedia("(max-width: 1279px)");
  mobile.addEventListener("change", onChange);
  laptop.addEventListener("change", onChange);
  return () => {
    mobile.removeEventListener("change", onChange);
    laptop.removeEventListener("change", onChange);
  };
}

function getViewportSnapshot(): Viewport {
  if (window.matchMedia("(max-width: 639px)").matches) return "mobile";
  if (window.matchMedia("(max-width: 1279px)").matches) return "laptop";
  return "desktop";
}

function getServerSnapshot(): Viewport {
  return "desktop";
}

type ModelStickersProps = {
  docked: boolean;
  className?: string;
};

export function ModelStickers({ docked, className = "" }: ModelStickersProps) {
  const reduceMotion = useReducedMotion();
  const viewport = useSyncExternalStore(
    subscribeViewport,
    getViewportSnapshot,
    getServerSnapshot,
  );
  const isMobile = viewport === "mobile";
  const idleLayout =
    viewport === "mobile"
      ? IDLE_MOBILE
      : viewport === "laptop"
        ? IDLE_LAPTOP
        : IDLE_DESKTOP;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 z-[3] overflow-hidden bottom-[11rem] sm:bottom-[10.25rem] ${className}`}
      aria-hidden
    >
      {MODELS.map((model, i) => {
        const idle = idleLayout[i];
        const onLeft = i % 2 === 0;
        const railIndex = Math.floor(i / 2);
        const dockedTop = onLeft
          ? `${4.8 + railIndex * 3.55}rem`
          : `${6.2 + railIndex * 3.55}rem`;

        const idleScale =
          viewport === "mobile" ? 1 : viewport === "desktop" ? 0.95 : 0.85;
        const mark = (
            <span
              className={`model-logo-sticker pointer-events-none inline-flex items-center justify-center ${
                model.ink ? "model-logo-ink" : ""
              } ${model.id === "kimi" ? "model-logo-kimi" : ""} ${
                docked || isMobile
                  ? ""
                  : i % 3 === 0
                    ? "fun-tilt"
                    : i % 3 === 1
                      ? "fun-tilt-opp"
                      : ""
              }`}
              title={model.label}
            >
              {model.id === "kimi" ? (
                <KimiGlyph className="pointer-events-none relative z-[1] h-[1.15rem] w-[1.15rem] sm:h-[1.15rem] sm:w-[1.15rem] xl:h-6 xl:w-6" />
              ) : model.src ? (
                <Image
                  src={model.src}
                  alt=""
                  width={32}
                  height={32}
                  className="pointer-events-none relative z-[1] h-[1.15rem] w-[1.15rem] object-contain sm:h-[1.15rem] sm:w-[1.15rem] xl:h-6 xl:w-6"
                  unoptimized
                />
              ) : null}
            </span>
        );

        if (!docked) {
          return (
            <div
              key={model.id}
              className="pointer-events-none absolute"
              style={{
                left: idle.left,
                top: idle.top,
                transform: `translate(-50%, -50%) rotate(${idle.rotate}deg) scale(${idleScale})`,
              }}
            >
              {mark}
            </div>
          );
        }

        const animate =
          isMobile
            ? {
                left: onLeft ? "-18%" : "118%",
                right: "auto" as const,
                top: idle.top,
                x: "-50%",
                y: "-50%",
                rotate: onLeft ? -18 : 18,
                scale: 0.7,
                opacity: 0,
              }
            : {
                left: onLeft ? "0.65rem" : "auto",
                right: onLeft ? "auto" : "0.65rem",
                top: dockedTop,
                x: 0,
                y: 0,
                rotate: onLeft ? -6 : 6,
                scale: viewport === "laptop" ? 0.8 : 0.88,
                opacity: 0.9,
              };

        return (
          <motion.div
            key={model.id}
            className="pointer-events-none absolute"
            initial={false}
            animate={animate}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 120, damping: 18, mass: 0.85 }
            }
          >
            {mark}
          </motion.div>
        );
      })}
    </div>
  );
}
