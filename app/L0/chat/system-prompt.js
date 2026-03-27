export const DEFAULT_SYSTEM_PROMPT_PATH = "/chat/default-system-prompt.md";

const DEFAULT_SYSTEM_PROMPT_FALLBACK =
  "You are a helpful assistant inside Agent One. Respond clearly and directly. HTML inside Markdown may be rendered for the user. If you need browser work, include an execute block in the same response. If there is no execute block, the loop stops and your reply is treated as final.";
let defaultSystemPromptPromise = null;

function normalizeSystemPrompt(systemPrompt = "") {
  return typeof systemPrompt === "string" ? systemPrompt.trim() : "";
}

export async function fetchDefaultSystemPrompt(options = {}) {
  const forceRefresh = options.forceRefresh === true;

  if (!forceRefresh && defaultSystemPromptPromise) {
    return defaultSystemPromptPromise;
  }

  defaultSystemPromptPromise = fetch(DEFAULT_SYSTEM_PROMPT_PATH)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Unable to load the default system prompt (${response.status}).`);
      }

      const prompt = normalizeSystemPrompt(await response.text());

      if (!prompt) {
        throw new Error("The default system prompt file is empty.");
      }

      return prompt;
    })
    .catch(() => DEFAULT_SYSTEM_PROMPT_FALLBACK);

  return defaultSystemPromptPromise;
}
