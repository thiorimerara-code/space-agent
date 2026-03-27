const STORAGE_KEYS = {
  draft: "agent-one.chat.draft",
  history: "agent-one.chat.history",
  settings: "agent-one.chat.settings",
  systemPrompt: "agent-one.chat.system-prompt"
};

export const DEFAULT_CHAT_SETTINGS = {
  apiEndpoint: "https://openrouter.ai/api/v1/chat/completions",
  apiKey: "",
  model: "openai/gpt-4o-mini"
};

function readJson(key, fallbackValue) {
  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return fallbackValue;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    return fallbackValue;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadChatSettings() {
  return {
    ...DEFAULT_CHAT_SETTINGS,
    ...readJson(STORAGE_KEYS.settings, {})
  };
}

export function saveChatSettings(settings) {
  writeJson(STORAGE_KEYS.settings, settings);
}

export function loadChatHistory() {
  const history = readJson(STORAGE_KEYS.history, []);
  return Array.isArray(history) ? history : [];
}

export function saveChatHistory(history) {
  writeJson(STORAGE_KEYS.history, history);
}

export function clearChatHistory() {
  window.localStorage.removeItem(STORAGE_KEYS.history);
}

export function loadChatDraft() {
  return window.localStorage.getItem(STORAGE_KEYS.draft) || "";
}

export function saveChatDraft(draft) {
  window.localStorage.setItem(STORAGE_KEYS.draft, draft);
}

export function clearChatDraft() {
  window.localStorage.removeItem(STORAGE_KEYS.draft);
}

export function loadSystemPrompt() {
  return window.localStorage.getItem(STORAGE_KEYS.systemPrompt) || "";
}

export function saveSystemPrompt(systemPrompt) {
  window.localStorage.setItem(STORAGE_KEYS.systemPrompt, systemPrompt);
}
