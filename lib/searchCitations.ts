import type { Link, Root, RootContent, Text } from "mdast";
import { unified, type Plugin } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { decodeString } from "micromark-util-decode-string";
import type { SearchSource } from "./searchEvidence";

export function sourceHref(source: SearchSource): string | undefined {
  try {
    const url = new URL(source.url);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch {}
}

type KnownSource = { source: SearchSource; index: number; href: string };
type Edit = { start: number; end: number; value: string; citation?: KnownSource };
const parser = unified().use(remarkParse).use(remarkGfm);

function sourceMap(sources: readonly SearchSource[]) {
  const known = new Map<string, KnownSource>();
  sources.forEach((source, index) => {
    const href = sourceHref(source);
    if (href) known.set(source.id, { source, index, href });
  });
  return known;
}

function escaped(raw: string, offset: number) {
  let count = 0;
  for (let index = offset - 1; index >= 0 && raw[index] === "\\"; index--) count++;
  return count % 2 === 1;
}

function textEdits(raw: string, known: Map<string, KnownSource>, citations: boolean, streaming: boolean): Edit[] {
  const literalRanges = [...raw.matchAll(/\$\$[\s\S]*?\$\$|\$[^\n$]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g)]
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
  const ticks = [...raw.matchAll(/`+/g)].filter(match => !escaped(raw, match.index));
  for (let index = 0; index < ticks.length; index++) {
    const closing = ticks.findIndex((match, offset) => offset > index && match[0].length === ticks[index][0].length);
    literalRanges.push({ start: ticks[index].index, end: closing < 0 ? raw.length : ticks[closing].index + ticks[closing][0].length });
    if (closing < 0) break;
    index = closing;
  }
  const protectedRanges: { start: number; end: number }[] = [];
  for (const range of literalRanges.sort((a, b) => a.start - b.start)) {
    const previous = protectedRanges.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else protectedRanges.push(range);
  }
  const protectedAt = (index: number) => {
    let low = 0;
    let high = protectedRanges.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const range = protectedRanges[middle];
      if (index < range.start) high = middle - 1;
      else if (index >= range.end) low = middle + 1;
      else return true;
    }
    return false;
  };
  const markers = [...raw.matchAll(/\[source:([a-zA-Z0-9_-]{1,128})\]/g)]
    .filter(match => !escaped(raw, match.index) && !protectedAt(match.index))
    .map(match => ({ start: match.index, end: match.index + match[0].length, found: known.get(match[1]) }));
  const knownMarkers = markers.filter(marker => marker.found);
  const removed = new Set<number>();
  const stack: number[] = [];
  for (let index = 0; index < raw.length; index++) {
    if (escaped(raw, index) || protectedAt(index)) continue;
    if (raw[index] === "[") stack.push(index);
    else if (raw[index] === "]" && stack.length) {
      const start = stack.pop()!;
      if (markers.some(marker => marker.start === start && marker.end === index + 1)) continue;
      const inside = knownMarkers.filter(marker => marker.start > start && marker.end <= index);
      if (!inside.length) continue;
      let extra = "";
      for (let offset = start + 1; offset < index; offset++) {
        const marker = inside.find(item => item.start === offset);
        if (marker) offset = marker.end - 1;
        else if (!removed.has(offset)) extra += raw[offset];
      }
      if (/^[\s,;]*$/.test(extra)) { removed.add(start); removed.add(index); }
    }
  }
  const edits: Edit[] = [];
  for (let index = 1; index < knownMarkers.length; index++) {
    const start = knownMarkers[index - 1].end;
    const end = knownMarkers[index].start;
    const between = raw.slice(start, end).split("").filter((_, offset) => !removed.has(start + offset)).join("");
    if (/^[\s,;]*$/.test(between) && (start !== end || between !== " ")) edits.push({ start, end, value: " " });
  }
  for (const offset of removed) {
    if (!edits.some(edit => offset >= edit.start && offset < edit.end)) edits.push({ start: offset, end: offset + 1, value: "" });
  }
  if (citations) markers.forEach(marker => edits.push({ start: marker.start, end: marker.end, value: "", citation: marker.found }));
  if (streaming && known.size) {
    const start = raw.lastIndexOf("[source");
    const tail = raw.slice(start);
    if (start >= 0 && !escaped(raw, start) && !protectedAt(start) && /^\[source(?::[a-zA-Z0-9_-]{0,128})?$/.test(tail) &&
      [...known.keys()].some(id => `[source:${id}]`.startsWith(tail))) {
      let from = start;
      while (from > 0 && raw[from - 1] === "[" && !escaped(raw, from - 1)) from--;
      const previous = knownMarkers.findLast(marker => marker.end <= from);
      if (previous) {
        const gap = raw.slice(previous.end, from).split("").filter((_, offset) => !removed.has(previous.end + offset)).join("");
        if (/^[\s,;]*$/.test(gap)) from = previous.end;
      }
      for (const opening of stack.filter(index => index < from).reverse()) {
        let extra = "";
        let found = false;
        for (let offset = opening + 1; offset < from; offset++) {
          const marker = knownMarkers.find(item => item.start === offset && item.end <= from);
          if (marker) { found = true; offset = marker.end - 1; }
          else if (!removed.has(offset)) extra += raw[offset];
        }
        if (found && /^[\s,;]*$/.test(extra)) {
          removed.add(opening);
          edits.push({ start: opening, end: opening + 1, value: "" });
        }
      }
      for (let index = edits.length - 1; index >= 0; index--) if (edits[index].start >= from) edits.splice(index, 1);
      edits.push({ start: from, end: raw.length, value: "" });
    }
  }
  return edits.sort((a, b) => a.start - b.start || a.end - b.end);
}

function visitText(node: Root | RootContent, visit: (node: Text) => void) {
  if (node.type === "text") visit(node);
  else if ("children" in node && node.type !== "link" && node.type !== "linkReference") node.children.forEach(child => visitText(child, visit));
}

function replaceMarkdown(markdown: string, sources: readonly SearchSource[], copy: boolean, streaming: boolean) {
  const known = sourceMap(sources);
  const replacements: Edit[] = [];
  visitText(parser.parse(markdown), node => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    for (const edit of textEdits(markdown.slice(start, end), known, copy, streaming && end === markdown.length)) {
      replacements.push({ start: start + edit.start, end: start + edit.end, value: edit.citation
        ? `[${edit.citation.index + 1}](<${edit.citation.href.replace(/[<>]/g, encodeURIComponent)}>)` : edit.value });
    }
  });
  const parts: string[] = [];
  let offset = 0;
  for (const replacement of replacements) {
    parts.push(markdown.slice(offset, replacement.start), replacement.value);
    offset = replacement.end;
  }
  parts.push(markdown.slice(offset));
  return parts.join("");
}

export function copyWithSourceCitations(markdown: string, sources: readonly SearchSource[] = []): string {
  return replaceMarkdown(markdown, sources, true, false);
}

export function displayWithSourceCitations(markdown: string, sources: readonly SearchSource[] = [], streaming = false): string {
  return replaceMarkdown(markdown, sources, false, streaming);
}

export const remarkSourceCitations: Plugin<[readonly SearchSource[] | undefined], Root> = (sources = []) => {
  const known = sourceMap(sources);
  return (tree, file) => {
    const markdown = String(file.value);
    const visit = (parent: { children: RootContent[] }) => {
      parent.children = parent.children.flatMap((node): RootContent[] => {
        if (node.type === "text") {
          const start = node.position?.start.offset;
          const end = node.position?.end.offset;
          if (start === undefined || end === undefined) return [node];
          const raw = markdown.slice(start, end);
          const edits = textEdits(raw, known, true, false);
          if (!edits.length) return [node];
          const pieces: (Text | Link)[] = [];
          let offset = 0;
          const decodedOffset = (index: number) => decodeString(raw.slice(0, index)).replace(/\r\n?/g, "\n").replace(/\0/g, "\uFFFD").length;
          for (const edit of edits) {
            const from = decodedOffset(edit.start);
            const to = decodedOffset(edit.end);
            if (from > offset) pieces.push({ type: "text", value: node.value.slice(offset, from) });
            const found = edit.citation;
            if (found) pieces.push({
              type: "link", url: found.href, title: found.source.title,
              children: [{ type: "text", value: String(found.index + 1) }],
              data: { hProperties: { "data-source-id": found.source.id } },
            });
            else if (edit.value) pieces.push({ type: "text", value: edit.value });
            offset = to;
          }
          if (offset < node.value.length) pieces.push({ type: "text", value: node.value.slice(offset) });
          return pieces;
        }
        if ("children" in node && node.type !== "link" && node.type !== "linkReference") visit(node);
        return [node];
      });
    };
    visit(tree);
  };
};
