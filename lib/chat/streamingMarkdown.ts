import type { Element, Root, RootContent, Text } from "hast";
import type { Plugin } from "unified";

const MAX_STREAM_WORDS = 2048;
const EXCLUDED_TAGS = new Set(["a", "code", "kbd", "math", "pre", "samp", "script", "style", "svg", "textarea"]);

function isStreamWord(node: Element): boolean {
  const classes = node.properties.className;
  return Array.isArray(classes)
    ? classes.includes("stream-word")
    : typeof classes === "string" && classes.split(/\s+/).includes("stream-word");
}

export const rehypeStreamingWords: Plugin<[], Root> = () => (tree) => {
  // A fixed prefix budget keeps earlier spans mounted as more text arrives.
  let remaining = MAX_STREAM_WORDS;

  const wrapText = (node: Text): (Element | Text)[] => {
    const children: (Element | Text)[] = [];
    let offset = 0;
    for (const match of node.value.matchAll(/\S+/g)) {
      if (!remaining) break;
      if (match.index > offset) children.push({ type: "text", value: node.value.slice(offset, match.index) });
      children.push({
        type: "element",
        tagName: "span",
        properties: { className: ["stream-word"] },
        children: [{ type: "text", value: match[0] }],
      });
      remaining--;
      offset = match.index + match[0].length;
    }
    if (!offset) return [node];
    if (offset < node.value.length) children.push({ type: "text", value: node.value.slice(offset) });
    return children;
  };

  const visit = (parent: { children: RootContent[] }) => {
    parent.children = parent.children.flatMap((node): RootContent[] => {
      if (!remaining) return [node];
      if (node.type === "text") return wrapText(node);
      if (node.type === "element") {
        if (isStreamWord(node)) {
          remaining--;
        } else if (
          !EXCLUDED_TAGS.has(node.tagName) &&
          node.properties["data-source-id"] === undefined &&
          node.properties.dataSourceId === undefined
        ) {
          visit(node);
        }
      }
      return [node];
    });
  };

  visit(tree);
};
