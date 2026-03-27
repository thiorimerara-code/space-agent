import { streamChatCompletion } from "../chat/api.js";
import {
  createExecutionContext,
  extractExecuteBlocks,
  formatExecutionResultsMessage,
  serializeExecutionResults
} from "../chat/execution-context.js";
import { marked } from "../chat/marked.esm.js";
import { fetchDefaultSystemPrompt } from "../chat/system-prompt.js";
import {
  clearChatDraft,
  clearChatHistory,
  loadChatDraft,
  loadChatHistory,
  loadChatSettings,
  loadSystemPrompt,
  saveChatDraft,
  saveChatHistory,
  saveChatSettings,
  saveSystemPrompt
} from "../chat/storage.js";

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role,
    content
  };
}

function summarizeSystemPrompt(systemPrompt) {
  if (!systemPrompt.trim()) {
    return "No system prompt";
  }

  const preview = systemPrompt.trim().replace(/\s+/g, " ");
  return preview.length > 72 ? `${preview.slice(0, 72)}...` : preview;
}

function summarizeEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.host;
  } catch (error) {
    return endpoint || "Not set";
  }
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "0px";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
}

const EXECUTE_BLOCK_START_PATTERN = /(`{3,}|~{3,})execute(?:[^\S\r\n]+[^\r\n]+)?\r?\n/i;
const EXECUTION_OUTPUT_PATTERN = /^Code execution output:\s*```json\s*([\s\S]*?)\s*```$/i;
const markdownRenderer = new marked.Renderer();

markdownRenderer.code = ({ lang, text }) => {
  if (String(lang || "").trim().toLowerCase() === "execute") {
    return "";
  }

  const safeCode = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const languageClass = lang ? ` class="language-${lang}"` : "";
  return `<pre><code${languageClass}>${safeCode}</code></pre>`;
};

function stripExecuteBlocks(content) {
  if (typeof content !== "string" || !content.trim()) {
    return "";
  }

  let stripped = content;
  const executeBlocks = extractExecuteBlocks(content);

  executeBlocks.forEach((block) => {
    stripped = stripped.replace(block.raw, "");
  });

  const startMatch = stripped.match(EXECUTE_BLOCK_START_PATTERN);

  if (startMatch) {
    stripped = stripped.slice(0, startMatch.index);
  }

  return stripped.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeExecuteNarration(content) {
  return stripExecuteBlocks(content);
}

function parseExecuteDisplayContent(content) {
  if (typeof content !== "string" || !content.trim()) {
    return null;
  }

  const executeBlocks = extractExecuteBlocks(content);

  if (executeBlocks.length) {
    let narration = content;

    executeBlocks.forEach((block) => {
      narration = narration.replace(block.raw, "");
    });

    return {
      blocks: executeBlocks.map((block) => block.code.trimEnd()),
      isIncomplete: false,
      narration: normalizeExecuteNarration(narration)
    };
  }

  const startMatch = content.match(EXECUTE_BLOCK_START_PATTERN);

  if (!startMatch) {
    return null;
  }

  return {
    blocks: [content.slice(startMatch.index + startMatch[0].length).trimEnd()],
    isIncomplete: true,
    narration: normalizeExecuteNarration(content.slice(0, startMatch.index))
  };
}

function parseExecutionOutputMessage(content) {
  if (typeof content !== "string") {
    return null;
  }

  const match = content.trim().match(EXECUTION_OUTPUT_PATTERN);

  if (!match) {
    return null;
  }

  try {
    const payload = JSON.parse(match[1]);
    return Array.isArray(payload) ? payload : null;
  } catch (error) {
    return null;
  }
}

function appendTerminalLine(container, text, modifier) {
  const line = document.createElement("div");
  line.className = modifier ? `terminal-line ${modifier}` : "terminal-line";
  line.textContent = text;
  container.append(line);
}

function createTerminalOutputEntries(results) {
  if (!Array.isArray(results) || !results.length) {
    return [
      {
        modifier: "is-muted",
        text: "Running..."
      }
    ];
  }

  const entries = [];

  results.forEach((result, index) => {
    if (index > 0) {
      entries.push({
        type: "divider"
      });
    }

    const prints = Array.isArray(result.prints) ? result.prints : [];

    prints.forEach((entry) => {
      entries.push({
        modifier: "is-print",
        text: `[${entry.level}] ${entry.text}`
      });
    });

    if (typeof result.result === "string") {
      entries.push({
        modifier: "is-result",
        text: `=> ${result.result}`
      });
    }

    if (typeof result.error === "string") {
      entries.push({
        modifier: "is-error",
        text: `error: ${result.error}`
      });
    }

    if (!prints.length && typeof result.result !== "string" && typeof result.error !== "string") {
      entries.push({
        modifier: "is-muted",
        text: result.status || "done"
      });
    }

    entries.push({
      modifier: "is-meta",
      text: `${result.status || "done"}${typeof result.durationMs === "number" ? ` • ${result.durationMs} ms` : ""}`
    });
  });

  return entries;
}

function appendTerminalOutput(container, results) {
  createTerminalOutputEntries(results).forEach((entry) => {
    if (entry.type === "divider") {
      const divider = document.createElement("div");
      divider.className = "terminal-divider";
      divider.setAttribute("aria-hidden", "true");
      container.append(divider);
      return;
    }

    appendTerminalLine(container, entry.text, entry.modifier);
  });
}

function getTerminalInputText(executeDisplay) {
  if (!executeDisplay || !Array.isArray(executeDisplay.blocks)) {
    return "";
  }

  return executeDisplay.blocks.join("\n\n").trim();
}

function getTerminalOutputText(results) {
  return createTerminalOutputEntries(results)
    .map((entry) => (entry.type === "divider" ? "" : entry.text))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createMessageContentBlock(text, className = "message-content") {
  const content = document.createElement("p");
  content.className = className;
  content.textContent = text;
  return content;
}

function createAssistantMarkdownBlock(text, className = "message-content message-markdown") {
  const normalizedText = stripExecuteBlocks(text);

  if (!normalizedText) {
    return null;
  }

  const content = document.createElement("div");
  content.className = className;
  content.innerHTML = marked.parse(normalizedText, {
    breaks: true,
    gfm: true,
    renderer: markdownRenderer
  });
  return content;
}

function createTerminalActionButton({ action, active = false, disabled = false, iconName, messageId, title }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "terminal-action";
  button.dataset.terminalAction = action;
  button.dataset.terminalMessageId = messageId;
  button.title = title;
  button.setAttribute("aria-label", title);

  if (active) {
    button.classList.add("is-active");
  }

  if (disabled) {
    button.disabled = true;
  }

  const icon = document.createElement("x-icon");
  icon.textContent = iconName;
  button.append(icon);
  return button;
}

function createTerminalCard({ executeDisplay, isConversationBusy, isStreaming, messageId, outputResults, rerunningMessageId }) {
  const terminal = document.createElement("section");
  terminal.className = "terminal-card";

  const terminalBar = document.createElement("div");
  terminalBar.className = "terminal-bar";

  const terminalTitle = document.createElement("span");
  terminalTitle.className = "terminal-title";
  terminalTitle.textContent = "browser-exec";

  const terminalActions = document.createElement("div");
  terminalActions.className = "terminal-actions";
  terminalActions.append(
    createTerminalActionButton({
      action: "copy-input",
      disabled: !getTerminalInputText(executeDisplay),
      iconName: "code",
      messageId,
      title: "Copy input"
    }),
    createTerminalActionButton({
      action: "copy-output",
      disabled: !Array.isArray(outputResults) || !outputResults.length,
      iconName: "content_copy",
      messageId,
      title: "Copy output"
    }),
    createTerminalActionButton({
      action: "rerun",
      active: rerunningMessageId === messageId,
      disabled: isConversationBusy || isStreaming || executeDisplay.isIncomplete || !getTerminalInputText(executeDisplay),
      iconName: "replay",
      messageId,
      title: "Run again"
    })
  );

  terminalBar.append(terminalTitle, terminalActions);

  const inputPane = document.createElement("div");
  inputPane.className = "terminal-pane terminal-pane-input";

  const inputLabel = document.createElement("span");
  inputLabel.className = "terminal-pane-label";
  inputLabel.textContent = "Input";

  const inputBody = document.createElement("div");
  inputBody.className = "terminal-pane-scroll";

  executeDisplay.blocks.forEach((block) => {
    const inputBlock = document.createElement("pre");
    inputBlock.className = "terminal-code";
    inputBlock.textContent = block || (isStreaming ? "" : "[empty]");
    inputBody.append(inputBlock);
  });

  if (executeDisplay.isIncomplete && isStreaming) {
    appendTerminalLine(inputBody, "Streaming command...", "is-muted");
  }

  inputPane.append(inputLabel, inputBody);

  const outputPane = document.createElement("div");
  outputPane.className = "terminal-pane terminal-pane-output";

  const outputLabel = document.createElement("span");
  outputLabel.className = "terminal-pane-label";
  outputLabel.textContent = "Output";

  const outputBody = document.createElement("div");
  outputBody.className = "terminal-pane-scroll";
  appendTerminalOutput(outputBody, outputResults || []);

  outputPane.append(outputLabel, outputBody);
  terminal.append(terminalBar, inputPane, outputPane);
  return terminal;
}

function createStandardMessageBubble(message) {
  const bubble = document.createElement("article");
  bubble.className = "message-bubble";

  if (message.streaming) {
    bubble.classList.add("is-streaming");
  }

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = message.role === "user" ? "You" : "Assistant";

  bubble.append(label);

  if (message.role === "assistant") {
    const markdownBlock = createAssistantMarkdownBlock(message.content || (message.streaming ? "Streaming..." : ""));
    if (markdownBlock) {
      bubble.append(markdownBlock);
    }
  } else {
    bubble.append(createMessageContentBlock(message.content || (message.streaming ? "Streaming..." : "")));
  }

  return bubble;
}

function createAssistantSequenceBubble(group, options = {}) {
  const bubble = document.createElement("article");
  bubble.className = "message-bubble is-terminal";

  if (group.sections.some((section) => Boolean(section.message.streaming))) {
    bubble.classList.add("is-streaming");
  }

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = "Assistant";
  bubble.append(label);

  group.sections.forEach((section) => {
    const sectionElement = document.createElement("div");
    sectionElement.className = "assistant-sequence-section";

    if (section.type === "execute") {
      if (section.executeDisplay.narration) {
        const narrationBlock = createAssistantMarkdownBlock(
          section.executeDisplay.narration,
          "message-content message-markdown terminal-note"
        );

        if (narrationBlock) {
          sectionElement.append(narrationBlock);
        }
      }

      sectionElement.append(
        createTerminalCard({
          executeDisplay: section.executeDisplay,
          isConversationBusy: options.isConversationBusy,
          isStreaming: Boolean(section.message.streaming),
          messageId: section.message.id,
          outputResults: section.outputResults,
          rerunningMessageId: options.rerunningMessageId
        })
      );
    } else {
      sectionElement.classList.add("is-followup");
      const followupBlock = createAssistantMarkdownBlock(
        section.message.content || (section.message.streaming ? "Streaming..." : ""),
        "message-content message-markdown terminal-followup"
      );

      if (followupBlock) {
        sectionElement.append(followupBlock);
      }
    }

    bubble.append(sectionElement);
  });

  return bubble;
}

function createStandaloneExecutionOutputBubble(outputResults) {
  const bubble = document.createElement("article");
  bubble.className = "message-bubble is-terminal is-terminal-output";

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = "Execution";
  bubble.append(label);

  const terminal = document.createElement("section");
  terminal.className = "terminal-card is-output-only";

  const outputPane = document.createElement("div");
  outputPane.className = "terminal-pane terminal-pane-output";

  const outputLabel = document.createElement("span");
  outputLabel.className = "terminal-pane-label";
  outputLabel.textContent = "Output";
  const outputBody = document.createElement("div");
  outputBody.className = "terminal-pane-scroll";
  appendTerminalOutput(outputBody, outputResults);
  outputPane.append(outputLabel, outputBody);

  terminal.append(outputPane);
  bubble.append(terminal);
  return bubble;
}

function buildMessageDisplayGroups(history, options = {}) {
  const groups = [];
  const outputOverrides = options.outputOverrides || {};

  for (let index = 0; index < history.length; index += 1) {
    const message = history[index];
    const executeDisplay = message.role === "assistant" ? parseExecuteDisplayContent(message.content) : null;
    const standaloneOutputResults = message.role === "user" ? parseExecutionOutputMessage(message.content) : null;

    if (executeDisplay) {
      const sections = [];
      let cursor = index;

      while (cursor < history.length) {
        const assistantMessage = history[cursor];

        if (assistantMessage.role !== "assistant") {
          break;
        }

        const assistantExecuteDisplay = parseExecuteDisplayContent(assistantMessage.content);

        if (assistantExecuteDisplay) {
          const nextMessage = history[cursor + 1];
          const outputResults = Array.isArray(outputOverrides[assistantMessage.id])
            ? outputOverrides[assistantMessage.id]
            : nextMessage && nextMessage.role === "user"
              ? parseExecutionOutputMessage(nextMessage.content)
              : null;

          sections.push({
            executeDisplay: assistantExecuteDisplay,
            message: assistantMessage,
            outputResults,
            type: "execute"
          });

          cursor += outputResults ? 2 : 1;
          continue;
        }

        sections.push({
          message: assistantMessage,
          type: "text"
        });
        cursor += 1;
        break;
      }

      groups.push({
        sections,
        type: "assistant-sequence"
      });

      index = cursor - 1;
      continue;
    }

    if (standaloneOutputResults) {
      groups.push({
        outputResults: standaloneOutputResults,
        type: "standalone-output"
      });
      continue;
    }

    groups.push({
      message,
      type: "standard"
    });
  }

  return groups;
}

function renderMessages(thread, history, options = {}) {
  const shouldPreserveScroll = options.preserveScroll === true;
  const previousBottomOffset = shouldPreserveScroll ? thread.scrollHeight - thread.scrollTop : 0;

  thread.innerHTML = "";

  if (!history.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "chat-empty";
    emptyState.textContent =
      "Your messages, the system prompt, connection settings, and the current draft are stored locally in this browser.";
    thread.append(emptyState);
    return;
  }

  buildMessageDisplayGroups(history, options).forEach((group) => {
    const row = document.createElement("div");

    if (group.type === "assistant-sequence") {
      row.className = "message-row assistant terminal-row";
      row.append(createAssistantSequenceBubble(group, options));
    } else if (group.type === "standalone-output") {
      row.className = "message-row assistant terminal-row execution-output-row";
      row.append(createStandaloneExecutionOutputBubble(group.outputResults));
    } else {
      row.className = `message-row ${group.message.role}`;
      row.append(createStandardMessageBubble(group.message));
    }

    thread.append(row);
  });

  if (shouldPreserveScroll) {
    thread.scrollTop = Math.max(0, thread.scrollHeight - previousBottomOffset);
    return;
  }

  thread.scrollTop = thread.scrollHeight;
}

function updateSummary(elements, state) {
  elements.endpointSummary.textContent = summarizeEndpoint(state.settings.apiEndpoint);
  elements.modelSummary.textContent = state.settings.model || "Not set";
  elements.promptSummary.textContent = summarizeSystemPrompt(state.systemPrompt);
}

function setStatus(elements, message) {
  elements.status.textContent = message;
}

async function copyTextToClipboard(text) {
  if (typeof text !== "string" || !text.length) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Fall back to a temporary textarea below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  const copied = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
  textarea.remove();
  return copied;
}

function findExecuteSection(history, messageId, outputOverrides = {}) {
  const messageIndex = history.findIndex((message) => message.id === messageId && message.role === "assistant");

  if (messageIndex === -1) {
    return null;
  }

  const message = history[messageIndex];
  const executeDisplay = parseExecuteDisplayContent(message.content);

  if (!executeDisplay) {
    return null;
  }

  const nextMessage = history[messageIndex + 1];
  const outputResults = Array.isArray(outputOverrides[messageId])
    ? outputOverrides[messageId]
    : nextMessage && nextMessage.role === "user"
      ? parseExecutionOutputMessage(nextMessage.content)
      : null;

  return {
    executeDisplay,
    message,
    outputResults
  };
}

function syncComposerState(elements, state) {
  elements.input.disabled = state.isSending;
  elements.sendButton.disabled = state.isSending || state.isLoadingDefaultSystemPrompt;
}

function renderChat(elements, state, options = {}) {
  renderMessages(elements.thread, state.history, {
    isConversationBusy: state.isSending,
    outputOverrides: state.executionOutputOverrides,
    preserveScroll: options.preserveScroll === true,
    rerunningMessageId: state.rerunningMessageId
  });
}

function persistHistory(state) {
  saveChatHistory(
    state.history.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content
    }))
  );
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }

  dialog.setAttribute("open", "open");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
    return;
  }

  dialog.removeAttribute("open");
}

function createStreamingAssistantMessage() {
  return {
    ...createMessage("assistant", ""),
    streaming: true
  };
}

async function streamAssistantResponse(state, elements, requestMessages, assistantMessage) {
  setStatus(elements, "Streaming response...");

  await streamChatCompletion({
    settings: state.settings,
    systemPrompt: state.systemPrompt,
    messages: requestMessages,
    onDelta(delta) {
      assistantMessage.content += delta;
      persistHistory(state);
      renderChat(elements, state);
    }
  });

  assistantMessage.streaming = false;

  if (!assistantMessage.content.trim()) {
    assistantMessage.content = "[No content returned]";
  }

  persistHistory(state);
  renderChat(elements, state);
}

async function executeAssistantBlocks(executionContext, assistantContent, elements) {
  const executionResults = await executionContext.executeFromContent(assistantContent, {
    onBeforeBlock({ index, total }) {
      if (!total) {
        return;
      }

      const statusMessage =
        total === 1 ? "Executing browser code..." : `Executing browser code (${index + 1}/${total})...`;

      setStatus(elements, statusMessage);
    }
  });

  if (!executionResults.length) {
    return null;
  }

  return executionResults;
}

async function runConversationLoop(state, elements, executionContext, initialUserMessage) {
  const maxAutoExecutionRounds = 8;
  let nextUserMessage = initialUserMessage;
  let autoExecutionRounds = 0;

  while (nextUserMessage) {
    const requestMessages =
      state.history[state.history.length - 1]?.id === nextUserMessage.id
        ? [...state.history]
        : [...state.history, nextUserMessage];
    const assistantMessage = createStreamingAssistantMessage();

    state.history = [...requestMessages, assistantMessage];
    persistHistory(state);
    renderChat(elements, state);

    try {
      await streamAssistantResponse(state, elements, requestMessages, assistantMessage);
    } catch (error) {
      assistantMessage.streaming = false;

      if (!assistantMessage.content.trim()) {
        state.history = requestMessages;
      }

      persistHistory(state);
      renderChat(elements, state);
      throw error;
    }

    const executionResults = await executeAssistantBlocks(executionContext, assistantMessage.content, elements);

    if (!executionResults || !executionResults.length) {
      return;
    }

    autoExecutionRounds += 1;

    nextUserMessage = createMessage("user", formatExecutionResultsMessage(executionResults));
    state.history = [...state.history, nextUserMessage];
    persistHistory(state);
    renderChat(elements, state);
    setStatus(elements, "Sending code execution output...");

    if (autoExecutionRounds >= maxAutoExecutionRounds) {
      throw new Error(
        `Stopped after ${maxAutoExecutionRounds} automatic execute rounds to avoid an infinite loop.`
      );
    }
  }
}

export function initializeChatInterface() {
  const elements = {
    thread: document.querySelector("[data-chat-thread]"),
    form: document.querySelector("[data-chat-form]"),
    input: document.querySelector("[data-chat-input]"),
    sendButton: document.querySelector("[data-chat-send-button]"),
    clearButton: document.querySelector("[data-chat-clear-button]"),
    systemButtons: Array.from(document.querySelectorAll("[data-chat-system-button]")),
    settingsButtons: Array.from(document.querySelectorAll("[data-chat-settings-button]")),
    status: document.querySelector("[data-chat-status]"),
    endpointSummary: document.querySelector("[data-chat-endpoint-summary]"),
    modelSummary: document.querySelector("[data-chat-model-summary]"),
    promptSummary: document.querySelector("[data-chat-prompt-summary]"),
    systemDialog: document.querySelector("[data-chat-system-dialog]"),
    systemForm: document.querySelector("[data-chat-system-form]"),
    systemInput: document.querySelector("[data-chat-system-input]"),
    systemDefault: document.querySelector("[data-chat-system-default]"),
    systemCancel: document.querySelector("[data-chat-system-cancel]"),
    settingsDialog: document.querySelector("[data-chat-settings-dialog]"),
    settingsForm: document.querySelector("[data-chat-settings-form]"),
    settingsCancel: document.querySelector("[data-chat-settings-cancel]"),
    endpointInput: document.querySelector("[data-chat-endpoint-input]"),
    modelInput: document.querySelector("[data-chat-model-input]"),
    apiKeyInput: document.querySelector("[data-chat-api-key-input]")
  };

  if (!elements.thread || !elements.form || !elements.input) {
    return;
  }

  const state = {
    defaultSystemPrompt: "",
    executionOutputOverrides: Object.create(null),
    history: loadChatHistory(),
    isLoadingDefaultSystemPrompt: false,
    isSending: false,
    rerunningMessageId: "",
    settings: loadChatSettings(),
    systemPrompt: loadSystemPrompt()
  };
  const executionContext = createExecutionContext({
    targetWindow: window
  });

  elements.input.value = loadChatDraft();
  autoResizeTextarea(elements.input);
  renderChat(elements, state);
  updateSummary(elements, state);
  setStatus(elements, state.systemPrompt.trim() ? "Ready." : "Loading default system prompt...");

  if (elements.systemDefault) {
    elements.systemDefault.disabled = true;
  }

  if (!state.systemPrompt.trim()) {
    state.isLoadingDefaultSystemPrompt = true;
  }

  syncComposerState(elements, state);

  async function ensureDefaultSystemPrompt(options = {}) {
    const shouldReplaceSystemPrompt = options.replaceCurrent === true;
    const preserveStatus = options.preserveStatus === true;

    if (state.isLoadingDefaultSystemPrompt && state.defaultSystemPrompt) {
      return state.defaultSystemPrompt;
    }

    if (!state.defaultSystemPrompt || options.forceRefresh === true) {
      state.isLoadingDefaultSystemPrompt = true;
      state.defaultSystemPrompt = await fetchDefaultSystemPrompt({
        forceRefresh: options.forceRefresh
      });
      state.isLoadingDefaultSystemPrompt = false;
    }

    if (shouldReplaceSystemPrompt || !state.systemPrompt.trim()) {
      state.systemPrompt = state.defaultSystemPrompt;
    }

    updateSummary(elements, state);

    if (elements.systemDefault) {
      elements.systemDefault.disabled = false;
    }

    syncComposerState(elements, state);

    if (!preserveStatus) {
      setStatus(elements, "Ready.");
    }

    return state.defaultSystemPrompt;
  }

  ensureDefaultSystemPrompt({
    preserveStatus: state.systemPrompt.trim()
  }).catch(() => {
    state.isLoadingDefaultSystemPrompt = false;

    if (elements.systemDefault) {
      elements.systemDefault.disabled = false;
    }

    syncComposerState(elements, state);

    updateSummary(elements, state);
    setStatus(elements, "Ready.");
  });

  elements.input.addEventListener("input", () => {
    saveChatDraft(elements.input.value);
    autoResizeTextarea(elements.input);
  });

  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.form.requestSubmit();
    }
  });

  elements.thread.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-terminal-action]");

    if (!actionButton || !elements.thread.contains(actionButton)) {
      return;
    }

    const action = actionButton.dataset.terminalAction;
    const messageId = actionButton.dataset.terminalMessageId;

    if (!action || !messageId) {
      return;
    }

    const section = findExecuteSection(state.history, messageId, state.executionOutputOverrides);

    if (!section) {
      setStatus(elements, "That execution step is no longer available.");
      return;
    }

    if (action === "copy-input") {
      const copied = await copyTextToClipboard(getTerminalInputText(section.executeDisplay));
      setStatus(elements, copied ? "Input copied." : "Unable to copy input.");
      return;
    }

    if (action === "copy-output") {
      if (!Array.isArray(section.outputResults) || !section.outputResults.length) {
        setStatus(elements, "No execution output to copy yet.");
        return;
      }

      const outputText = getTerminalOutputText(section.outputResults);

      if (!outputText) {
        setStatus(elements, "No execution output to copy yet.");
        return;
      }

      const copied = await copyTextToClipboard(outputText);
      setStatus(elements, copied ? "Output copied." : "Unable to copy output.");
      return;
    }

    if (action !== "rerun" || state.isSending) {
      return;
    }

    state.isSending = true;
    state.rerunningMessageId = messageId;
    syncComposerState(elements, state);
    renderChat(elements, state, {
      preserveScroll: true
    });

    try {
      const executionResults = await executeAssistantBlocks(executionContext, section.message.content, elements);

      if (!executionResults || !executionResults.length) {
        setStatus(elements, "No execute blocks found to rerun.");
        return;
      }

      state.executionOutputOverrides[messageId] = serializeExecutionResults(executionResults);
      renderChat(elements, state, {
        preserveScroll: true
      });
      setStatus(elements, "Execution refreshed.");
    } catch (error) {
      setStatus(elements, error.message);
    } finally {
      state.isSending = false;
      state.rerunningMessageId = "";
      syncComposerState(elements, state);
      renderChat(elements, state, {
        preserveScroll: true
      });
    }
  });

  elements.clearButton.addEventListener("click", () => {
    if (!window.confirm("Clear this chat history?")) {
      return;
    }

    state.history = [];
    state.executionOutputOverrides = Object.create(null);
    persistHistory(state);
    clearChatHistory();
    executionContext.reset();
    renderChat(elements, state);
    setStatus(elements, "Chat cleared and execution context reset.");
  });

  elements.systemButtons.forEach((button) => {
    button.addEventListener("click", () => {
      elements.systemInput.value = state.systemPrompt || state.defaultSystemPrompt;
      openDialog(elements.systemDialog);
    });
  });

  elements.systemCancel.addEventListener("click", () => {
    closeDialog(elements.systemDialog);
  });

  if (elements.systemDefault) {
    elements.systemDefault.addEventListener("click", async () => {
      setStatus(elements, "Loading default system prompt...");
      const defaultSystemPrompt = await ensureDefaultSystemPrompt({
        forceRefresh: true,
        preserveStatus: true,
        replaceCurrent: false
      });
      elements.systemInput.value = defaultSystemPrompt;
      setStatus(elements, "Default system prompt loaded into the editor.");
    });
  }

  elements.systemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.systemPrompt = elements.systemInput.value;
    saveSystemPrompt(state.systemPrompt);
    updateSummary(elements, state);
    setStatus(elements, "System prompt updated.");
    closeDialog(elements.systemDialog);
  });

  elements.settingsButtons.forEach((button) => {
    button.addEventListener("click", () => {
      elements.endpointInput.value = state.settings.apiEndpoint;
      elements.modelInput.value = state.settings.model;
      elements.apiKeyInput.value = state.settings.apiKey;
      openDialog(elements.settingsDialog);
    });
  });

  elements.settingsCancel.addEventListener("click", () => {
    closeDialog(elements.settingsDialog);
  });

  elements.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();

    state.settings = {
      apiEndpoint: elements.endpointInput.value.trim(),
      model: elements.modelInput.value.trim(),
      apiKey: elements.apiKeyInput.value.trim()
    };

    saveChatSettings(state.settings);
    updateSummary(elements, state);
    setStatus(elements, "Connection settings updated.");
    closeDialog(elements.settingsDialog);
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (state.isSending) {
      return;
    }

    if (state.isLoadingDefaultSystemPrompt) {
      setStatus(elements, "Loading default system prompt...");
      return;
    }

    const messageText = elements.input.value.trim();
    if (!messageText) {
      return;
    }

    state.isSending = true;
    syncComposerState(elements, state);

    const userMessage = createMessage("user", messageText);
    elements.input.value = "";
    clearChatDraft();
    autoResizeTextarea(elements.input);

    try {
      await runConversationLoop(state, elements, executionContext, userMessage);
      setStatus(elements, "Ready.");
    } catch (error) {
      setStatus(elements, error.message);
    } finally {
      state.isSending = false;
      syncComposerState(elements, state);
      renderChat(elements, state);
      elements.input.focus();
    }
  });
}
