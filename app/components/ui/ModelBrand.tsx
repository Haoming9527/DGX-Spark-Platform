"use client";

import Image from "next/image";
import { describeModel } from "../../../lib/modelMeta";

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

type ModelBrandMarkProps = {
  modelId: string;
  size?: number;
  className?: string;
};

export function ModelBrandMark({ modelId, size = 16, className = "" }: ModelBrandMarkProps) {
  const { family } = describeModel(modelId);

  if (family.glyph === "kimi") {
    return <KimiGlyph className={`${className} h-4 w-4`} />;
  }
  if (family.src) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${family.ink ? "text-foreground" : ""} ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={family.src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain"
          unoptimized
        />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[9px] font-bold text-muted ${className}`}
      aria-hidden
    >
      {family.label.slice(0, 1)}
    </span>
  );
}

type ModelLabelProps = {
  modelId: string;
  parameterSize?: string | null;
  compact?: boolean;
  className?: string;
};

export function ModelLabel({
  modelId,
  parameterSize,
  compact = false,
  className = "",
}: ModelLabelProps) {
  const { shortName, size } = describeModel(modelId, parameterSize);

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <ModelBrandMark modelId={modelId} />
      <span className="min-w-0 truncate font-medium text-foreground">
        {shortName}
      </span>
      {size && (
        <span
          className={`shrink-0 rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-muted ${
            compact ? "hidden sm:inline" : ""
          }`}
        >
          {size}
        </span>
      )}
    </span>
  );
}
