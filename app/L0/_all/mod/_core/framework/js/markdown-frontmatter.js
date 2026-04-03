import * as yaml from "./yaml-lite.js";

function normalizeMarkdownText(text = "") {
  return typeof text === "string" ? text.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n") : "";
}

function hasFrontmatterFence(text) {
  return text.startsWith("---\n") || text === "---";
}

function findClosingFence(text) {
  let searchIndex = 4;

  while (searchIndex <= text.length) {
    const fenceIndex = text.indexOf("\n---", searchIndex);

    if (fenceIndex === -1) {
      return -1;
    }

    const nextIndex = fenceIndex + "\n---".length;
    const nextChar = text[nextIndex] || "";

    if (!nextChar || nextChar === "\n") {
      return fenceIndex + 1;
    }

    searchIndex = nextIndex;
  }

  return -1;
}

export function parseMarkdownDocument(text = "") {
  const content = normalizeMarkdownText(text);

  if (!hasFrontmatterFence(content)) {
    return {
      body: content,
      content,
      frontmatter: {},
      frontmatterText: "",
      hasFrontmatter: false
    };
  }

  const closingFenceIndex = findClosingFence(content);

  if (closingFenceIndex === -1) {
    return {
      body: content,
      content,
      frontmatter: {},
      frontmatterText: "",
      hasFrontmatter: false
    };
  }

  const frontmatterText = content.slice(4, closingFenceIndex).trim();
  const bodyStartIndex = closingFenceIndex + 4;
  const body =
    content[bodyStartIndex] === "\n"
      ? content.slice(bodyStartIndex + 1)
      : content.slice(bodyStartIndex);

  return {
    body,
    content,
    frontmatter: yaml.parseSimpleYaml(frontmatterText),
    frontmatterText,
    hasFrontmatter: true
  };
}
