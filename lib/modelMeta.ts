export type ModelFamily = {
  id: string;
  label: string;
  src?: string;
  ink?: boolean;
  glyph?: "kimi";
};

const FAMILIES: Array<{ match: RegExp; family: ModelFamily }> = [
  { match: /llama|meta|muse/i, family: { id: "llama", label: "Meta", src: "/models/llama.svg" } },
  { match: /mistral/i, family: { id: "mistral", label: "Mistral", src: "/models/mistral.svg" } },
  { match: /nemotron|nvidia/i, family: { id: "nvidia", label: "NVIDIA", src: "/models/nvidia.svg" } },
  { match: /qwen/i, family: { id: "qwen", label: "Qwen", src: "/models/qwen.svg" } },
  { match: /deepseek/i, family: { id: "deepseek", label: "DeepSeek", src: "/models/deepseek.svg" } },
  { match: /minimax/i, family: { id: "minimax", label: "MiniMax", src: "/models/minimax.svg" } },
  { match: /gemma/i, family: { id: "gemma", label: "Gemma", src: "/models/gemma.svg" } },
  { match: /kimi/i, family: { id: "kimi", label: "Kimi", glyph: "kimi" } },
  { match: /gpt-oss|gptoss/i, family: { id: "gpt-oss", label: "GPT-OSS", src: "/models/gpt-oss.svg", ink: true } },
  { match: /\bglm\b|zai/i, family: { id: "zai", label: "Z.ai", src: "/models/zai.svg", ink: true } },
];

export function modelFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase();
  for (const row of FAMILIES) {
    if (row.match.test(id)) return row.family;
  }
  return { id: "unknown", label: "Model" };
}

export function modelShortName(modelId: string): string {
  const bare = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  const [base, tag] = bare.split(":");
  if (!tag || tag === "latest") return base;
  if (/^\d+(\.\d+)?[bBmM]([-_].*)?$/.test(tag) || /^[tq]\d/i.test(tag)) {
    return base;
  }
  return `${base}:${tag}`;
}

export function modelParamSize(
  modelId: string,
  parameterSize?: string | null,
): string | null {
  if (parameterSize) {
    const cleaned = parameterSize.replace(/\s+/g, "").toUpperCase();
    const m = cleaned.match(/(\d+(?:\.\d+)?)([BMK])/);
    if (m) return `${trimNum(m[1])}${m[2]}`;
  }

  const id = modelId.toLowerCase();
  const matches = [...id.matchAll(/(\d+(?:\.\d+)?)([bm])(?=[^a-z]|$)/gi)];
  if (matches.length > 0) {
    let best = matches[0];
    let bestVal = Number(best[1]) * (/m/i.test(best[2]) ? 0.001 : 1);
    for (const m of matches.slice(1)) {
      const val = Number(m[1]) * (/m/i.test(m[2]) ? 0.001 : 1);
      if (val > bestVal) {
        best = m;
        bestVal = val;
      }
    }
    return `${trimNum(best[1])}${best[2].toUpperCase()}`;
  }
  return null;
}

function trimNum(n: string) {
  return n.replace(/\.0$/, "");
}

export function describeModel(modelId: string, parameterSize?: string | null) {
  return {
    family: modelFamily(modelId),
    shortName: modelShortName(modelId),
    size: modelParamSize(modelId, parameterSize),
  };
}
