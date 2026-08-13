const THINK_PAIRS = [
  { open: "<think>", close: "</think>" },
  { open: "◁think▷", close: "◁/think▷" },
  { open: "<thinking>", close: "</thinking>" },
] as const;

const TAG_TOKENS = THINK_PAIRS.flatMap((p) => [p.open, p.close]);
const MAX_TAG_LEN = TAG_TOKENS.reduce((n, t) => Math.max(n, t.length), 0);

function findEarliestOpen(text: string): { index: number; open: string; close: string } | null {
  let best: { index: number; open: string; close: string } | null = null;
  for (const pair of THINK_PAIRS) {
    const index = text.indexOf(pair.open);
    if (index < 0) continue;
    if (!best || index < best.index) best = { index, open: pair.open, close: pair.close };
  }
  return best;
}

function stripIncompleteTagSuffix(text: string): string {
  const limit = Math.min(text.length, MAX_TAG_LEN - 1);
  for (let n = limit; n >= 1; n--) {
    const suffix = text.slice(-n);
    if (TAG_TOKENS.some((token) => token.startsWith(suffix) && token !== suffix)) {
      return text.slice(0, -n);
    }
  }
  return text;
}

export function splitAssistantText(raw: string): {
  content: string;
  thought: string;
  isThinking: boolean;
} {
  if (!raw) return { content: "", thought: "", isThinking: false };

  const thoughts: string[] = [];
  const contents: string[] = [];
  let rest = raw;
  let isThinking = false;

  while (rest.length > 0) {
    const hit = findEarliestOpen(rest);
    if (!hit) {
      contents.push(stripIncompleteTagSuffix(rest));
      break;
    }
    if (hit.index > 0) contents.push(rest.slice(0, hit.index));
    const afterOpen = rest.slice(hit.index + hit.open.length);
    const closeAt = afterOpen.indexOf(hit.close);
    if (closeAt < 0) {
      thoughts.push(stripIncompleteTagSuffix(afterOpen));
      isThinking = true;
      break;
    }
    thoughts.push(afterOpen.slice(0, closeAt));
    rest = afterOpen.slice(closeAt + hit.close.length);
  }

  return {
    content: contents.join("").trim(),
    thought: thoughts.map((part) => part.trim()).filter(Boolean).join("\n\n"),
    isThinking,
  };
}
