import * as skills from "/mod/_core/admin/views/agent/skills.js";

export const DEFAULT_ADMIN_SYSTEM_PROMPT_PATH = "/mod/_core/admin/views/agent/system-prompt.md";
export const ADMIN_HISTORY_COMPACT_PROMPT_PATH = "/mod/_core/admin/views/agent/compact-prompt.md";

let defaultSystemPromptPromise = null;
let compactPromptPromise = null;

function normalizeSystemPrompt(systemPrompt = "") {
  return typeof systemPrompt === "string" ? systemPrompt.trim() : "";
}

function formatCustomUserInstructions(systemPrompt = "") {
  const customPrompt = normalizeSystemPrompt(systemPrompt);

  if (!customPrompt) {
    return "";
  }

  return `## User specific instructions\n\n${customPrompt}`;
}

function stripDefaultPromptPrefix(storedPrompt, defaultSystemPrompt) {
  const normalizedStoredPrompt = normalizeSystemPrompt(storedPrompt);
  const normalizedDefaultPrompt = normalizeSystemPrompt(defaultSystemPrompt);

  if (!normalizedStoredPrompt) {
    return "";
  }

  if (!normalizedDefaultPrompt) {
    return normalizedStoredPrompt;
  }

  if (normalizedStoredPrompt === normalizedDefaultPrompt) {
    return "";
  }

  if (!normalizedStoredPrompt.startsWith(normalizedDefaultPrompt)) {
    return normalizedStoredPrompt;
  }

  return normalizedStoredPrompt.slice(normalizedDefaultPrompt.length).replace(/^\s+/u, "").trim();
}

async function loadPromptFile(promptPath, promptLabel) {
  const response = await fetch(promptPath);

  if (!response.ok) {
    throw new Error(`Unable to load the ${promptLabel} (${response.status}).`);
  }

  const prompt = normalizeSystemPrompt(await response.text());

  if (!prompt) {
    throw new Error(`The ${promptLabel} file is empty.`);
  }

  return prompt;
}

async function loadDefaultSystemPrompt() {
  return loadPromptFile(DEFAULT_ADMIN_SYSTEM_PROMPT_PATH, "default admin system prompt");
}

async function loadCompactPrompt() {
  return loadPromptFile(ADMIN_HISTORY_COMPACT_PROMPT_PATH, "admin history compact prompt");
}

export async function fetchDefaultAdminSystemPrompt(options = {}) {
  const forceRefresh = options.forceRefresh === true;

  if (!forceRefresh && defaultSystemPromptPromise) {
    return defaultSystemPromptPromise;
  }

  defaultSystemPromptPromise = loadDefaultSystemPrompt().catch((error) => {
    defaultSystemPromptPromise = null;
    throw error;
  });

  return defaultSystemPromptPromise;
}

export async function fetchAdminHistoryCompactPrompt(options = {}) {
  const forceRefresh = options.forceRefresh === true;

  if (!forceRefresh && compactPromptPromise) {
    return compactPromptPromise;
  }

  compactPromptPromise = loadCompactPrompt().catch((error) => {
    compactPromptPromise = null;
    throw error;
  });

  return compactPromptPromise;
}

export function extractCustomAdminSystemPrompt(storedPrompt = "", defaultSystemPrompt = "") {
  return stripDefaultPromptPrefix(storedPrompt, defaultSystemPrompt);
}

export async function buildRuntimeAdminSystemPrompt(systemPrompt = "", options = {}) {
  const basePrompt = normalizeSystemPrompt(
    options.defaultSystemPrompt || (await fetchDefaultAdminSystemPrompt())
  );
  const customPrompt = formatCustomUserInstructions(systemPrompt);
  const skillsSection = await skills.buildAdminSkillsPromptSection();

  return [basePrompt, customPrompt, skillsSection].filter(Boolean).join("\n\n");
}
