const EXECUTE_BLOCK_PATTERN = /(`{3,}|~{3,})execute(?:[^\S\r\n]+[^\r\n]+)?\r?\n([\s\S]*?)\r?\n\1/g;
const EXECUTION_CONTEXT_KEY = "__agentOneChatExecutionContext";
const SHARED_STATE_KEY = "__agentOneChatSharedState";
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug", "dir", "table", "assert"];
const INTERNAL_SCOPE_KEYS = new Set(["__agentOneCode", "__agentOneScope", "__agentOneWindow"]);
const RESERVED_SCOPE_KEYS = new Set([
  "A1",
  "agentContext",
  "agentOne",
  "browserState",
  "console",
  "ctx",
  "document",
  "globalThis",
  "page",
  "self",
  "state",
  "window"
]);

export function extractExecuteBlocks(content) {
  if (typeof content !== "string" || !content.trim()) {
    return [];
  }

  const blocks = [];
  const pattern = new RegExp(EXECUTE_BLOCK_PATTERN);
  let match = pattern.exec(content);

  while (match) {
    blocks.push({
      code: match[2],
      fence: match[1],
      index: match.index,
      raw: match[0]
    });

    match = pattern.exec(content);
  }

  return blocks;
}

function isNodeLike(targetWindow, value) {
  return Boolean(targetWindow.Node && value instanceof targetWindow.Node);
}

function isElementLike(targetWindow, value) {
  return Boolean(targetWindow.Element && value instanceof targetWindow.Element);
}

function isWindowLike(targetWindow, value) {
  return value === targetWindow;
}

function summarizeElement(element) {
  const tagName = element.tagName ? element.tagName.toLowerCase() : "element";
  const id = element.id ? `#${element.id}` : "";
  const classNames =
    typeof element.className === "string" && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).join(".")}`
      : "";

  return `<${tagName}${id}${classNames}>`;
}

function summarizeNode(targetWindow, value) {
  if (isElementLike(targetWindow, value)) {
    return summarizeElement(value);
  }

  if (!isNodeLike(targetWindow, value)) {
    return "";
  }

  if (value.nodeType === targetWindow.Node.TEXT_NODE) {
    return `#text(${JSON.stringify((value.textContent || "").trim())})`;
  }

  return `[Node type=${value.nodeType}]`;
}

function formatString(value) {
  if (value.length <= 220) {
    return value;
  }

  return `${value.slice(0, 217)}...`;
}

function formatEntries(entries, opener, closer, options) {
  const { targetWindow, depth, seen } = options;
  const maxEntries = 8;
  const nextDepth = depth + 1;
  const renderedEntries = entries.slice(0, maxEntries).map(([key, value]) => {
    return `${key}: ${formatExecutionValue(value, {
      targetWindow,
      depth: nextDepth,
      seen
    })}`;
  });

  if (entries.length > maxEntries) {
    renderedEntries.push("...");
  }

  return `${opener}${renderedEntries.join(", ")}${closer}`;
}

function formatArrayLike(values, label, options) {
  const { targetWindow, depth, seen } = options;
  const maxEntries = 8;
  const renderedValues = Array.from(values)
    .slice(0, maxEntries)
    .map((value) =>
      formatExecutionValue(value, {
        targetWindow,
        depth: depth + 1,
        seen
      })
    );

  if (values.length > maxEntries) {
    renderedValues.push("...");
  }

  return `${label}(${values.length}) [${renderedValues.join(", ")}]`;
}

function formatError(error) {
  if (!error) {
    return "";
  }

  return error.stack || `${error.name || "Error"}: ${error.message || String(error)}`;
}

function formatExecutionValue(value, options) {
  const { targetWindow, depth = 0, seen = new WeakSet() } = options;

  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return formatString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (value instanceof Error) {
    return formatError(value);
  }

  if (isWindowLike(targetWindow, value)) {
    return `[Window ${targetWindow.location?.href || ""}]`;
  }

  if (targetWindow.Document && value instanceof targetWindow.Document) {
    return `[Document ${value.URL || ""}]`;
  }

  if (targetWindow.Location && value instanceof targetWindow.Location) {
    return `[Location ${value.href || ""}]`;
  }

  if (isNodeLike(targetWindow, value)) {
    return summarizeNode(targetWindow, value);
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `Array(${value.length})`;
    }

    return formatArrayLike(value, "Array", {
      targetWindow,
      depth,
      seen
    });
  }

  if (targetWindow.NodeList && value instanceof targetWindow.NodeList) {
    return formatArrayLike(Array.from(value), "NodeList", {
      targetWindow,
      depth,
      seen
    });
  }

  if (targetWindow.HTMLCollection && value instanceof targetWindow.HTMLCollection) {
    return formatArrayLike(Array.from(value), "HTMLCollection", {
      targetWindow,
      depth,
      seen
    });
  }

  if (value instanceof Map) {
    if (depth >= 2) {
      return `Map(${value.size})`;
    }

    return formatEntries(Array.from(value.entries()), "Map { ", " }", {
      targetWindow,
      depth,
      seen
    });
  }

  if (value instanceof Set) {
    if (depth >= 2) {
      return `Set(${value.size})`;
    }

    return formatArrayLike(Array.from(value.values()), "Set", {
      targetWindow,
      depth,
      seen
    });
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    if (depth >= 2) {
      return `[${value.constructor?.name || "Object"}]`;
    }

    const entries = Object.entries(value);
    return formatEntries(entries, "{ ", " }", {
      targetWindow,
      depth,
      seen
    });
  }

  try {
    return String(value);
  } catch (error) {
    return `[Unprintable value: ${error.message}]`;
  }
}

function createConsoleRecorder(methodName, originalMethod, logs, targetWindow) {
  return (...args) => {
    if (methodName === "assert" && args[0]) {
      if (originalMethod) {
        originalMethod(...args);
      }
      return;
    }

    const logArgs = methodName === "assert" ? args.slice(1) : args;
    const text = logArgs.length
      ? logArgs
          .map((value) =>
            formatExecutionValue(value, {
              targetWindow
            })
          )
          .join(" ")
      : "(no output)";

    logs.push({
      level: methodName,
      text
    });

    if (originalMethod) {
      try {
        originalMethod(...args);
      } catch (error) {
        // Ignore console implementation edge cases.
      }
    }
  };
}

function patchConsole(targetWindow, logs) {
  if (!targetWindow.console) {
    return () => {};
  }

  const targetConsole = targetWindow.console;
  const originalMethods = [];

  CONSOLE_METHODS.forEach((methodName) => {
    if (typeof targetConsole[methodName] !== "function") {
      return;
    }

    const originalMethod = targetConsole[methodName].bind(targetConsole);

    try {
      targetConsole[methodName] = createConsoleRecorder(methodName, originalMethod, logs, targetWindow);
      originalMethods.push([methodName, originalMethod]);
    } catch (error) {
      // Ignore read-only console implementations.
    }
  });

  return () => {
    originalMethods.forEach(([methodName, originalMethod]) => {
      try {
        targetConsole[methodName] = originalMethod;
      } catch (error) {
        // Ignore read-only console implementations.
      }
    });
  };
}

function createExecutionScope(targetWindow, sharedState) {
  return new Proxy(sharedState, {
    has(_target, key) {
      if (key === Symbol.unscopables) {
        return false;
      }

      if (typeof key === "string" && INTERNAL_SCOPE_KEYS.has(key)) {
        return false;
      }

      return true;
    },
    get(target, key) {
      if (key === Symbol.unscopables) {
        return undefined;
      }

      if (key === "ctx" || key === "state" || key === "agentContext" || key === "browserState") {
        return target;
      }

      if (key === "page" || key === "window" || key === "globalThis" || key === "self") {
        return targetWindow;
      }

      if (key === "document") {
        return targetWindow.document;
      }

      if (key === "console") {
        return targetWindow.console;
      }

      if (key === "A1") {
        return targetWindow.A1;
      }

      if (key === "agentOne") {
        return targetWindow.agentOne;
      }

      if (Reflect.has(target, key)) {
        return Reflect.get(target, key);
      }

      return targetWindow[key];
    },
    set(target, key, value) {
      if (typeof key !== "string") {
        Reflect.set(target, key, value);
        return true;
      }

      if (key === "ctx" || key === "state" || key === "agentContext" || key === "browserState") {
        if (value && typeof value === "object") {
          Object.keys(target).forEach((targetKey) => delete target[targetKey]);
          Object.assign(target, value);
        }

        return true;
      }

      if (
        key === "console" ||
        key === "page" ||
        key === "window" ||
        key === "globalThis" ||
        key === "self" ||
        key === "document"
      ) {
        return false;
      }

      if (Reflect.has(target, key)) {
        Reflect.set(target, key, value);
        return true;
      }

      if (key in targetWindow && !RESERVED_SCOPE_KEYS.has(key)) {
        try {
          targetWindow[key] = value;
          return true;
        } catch (error) {
          // Fall through to shared state when the window property is read-only.
        }
      }

      Reflect.set(target, key, value);
      return true;
    },
    deleteProperty(target, key) {
      if (Reflect.has(target, key)) {
        return Reflect.deleteProperty(target, key);
      }

      return true;
    }
  });
}

function buildSourceUrl(runId) {
  return `agent-one-chat-execute-${runId}.js`;
}

function runInAsyncContext(execution) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction(
    "__agentExecution",
    `
      const __agentOneScope = __agentExecution.scope
      const __agentOneWindow = __agentExecution.targetWindow
      return await (async function () {
        with (__agentOneScope) {
${execution.code}
        }
      }).call(__agentOneWindow)
    `
  );

  return runner(execution);
}

function normalizeDuration(startTime, endTime) {
  return Math.max(0, Math.round((endTime - startTime) * 100) / 100);
}

function createSerializableExecutionResult(result) {
  const payload = {
    durationMs: result.durationMs,
    status: result.status
  };

  if (result.error) {
    payload.error = result.error.text;
  }

  if (Array.isArray(result.logs) && result.logs.length > 0) {
    payload.prints = result.logs.map((entry) => ({
      level: entry.level,
      text: entry.text
    }));
  }

  if (result.result !== undefined) {
    payload.result = result.resultText;
  }

  return payload;
}

export function serializeExecutionResults(results) {
  return results.map((result) => createSerializableExecutionResult(result));
}

export function formatExecutionResultsMessage(results) {
  return [
    "Code execution output:",
    "```json",
    JSON.stringify(serializeExecutionResults(results), null, 2),
    "```"
  ].join("\n");
}

export function createExecutionContext(options = {}) {
  const targetWindow = options.targetWindow || window;
  const existingContext = targetWindow[EXECUTION_CONTEXT_KEY];

  if (existingContext) {
    return existingContext;
  }

  const sharedState = targetWindow[SHARED_STATE_KEY] || Object.create(null);
  targetWindow[SHARED_STATE_KEY] = sharedState;
  targetWindow.__agentOneChatContext = sharedState;

  const executionContext = {
    runCount: 0,
    sharedState,
    async execute(code) {
      const source = typeof code === "string" ? code.replace(/\r\n/g, "\n") : "";
      const logs = [];
      const runId = executionContext.runCount + 1;
      const startedAt = targetWindow.performance?.now?.() ?? Date.now();
      const scope = createExecutionScope(targetWindow, sharedState);
      const restoreConsole = patchConsole(targetWindow, logs);
      const execution = {
        code: `${source}\n//# sourceURL=${buildSourceUrl(runId)}`,
        scope,
        targetWindow
      };

      let result;
      let error = null;

      executionContext.runCount = runId;

      try {
        result = await runInAsyncContext(execution);
      } catch (runError) {
        error = runError;
      } finally {
        restoreConsole();
      }

      const endedAt = targetWindow.performance?.now?.() ?? Date.now();

      return {
        code: source,
        durationMs: normalizeDuration(startedAt, endedAt),
        error: error
          ? {
              name: error.name || "Error",
              message: error.message || String(error),
              stack: error.stack || "",
              text: formatError(error)
            }
          : null,
        logs,
        result,
        resultText: error
          ? "undefined"
          : formatExecutionValue(result, {
              targetWindow
            }),
        runId,
        status: error ? "error" : "success"
      };
    },
    async executeAll(codeBlocks, options = {}) {
      if (!Array.isArray(codeBlocks) || !codeBlocks.length) {
        return [];
      }

      const results = [];

      for (let index = 0; index < codeBlocks.length; index += 1) {
        const code = codeBlocks[index];

        if (typeof options.onBeforeBlock === "function") {
          await options.onBeforeBlock({
            block: null,
            code,
            index,
            total: codeBlocks.length
          });
        }

        results.push(await executionContext.execute(code));
      }

      return results;
    },
    async executeFromContent(content, options = {}) {
      const blocks = extractExecuteBlocks(content);

      if (!blocks.length) {
        return [];
      }

      const results = [];

      for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index];

        if (typeof options.onBeforeBlock === "function") {
          await options.onBeforeBlock({
            block,
            code: block.code,
            index,
            total: blocks.length
          });
        }

        results.push(await executionContext.execute(block.code));
      }

      return results.map((result, index) => ({
        ...result,
        block: blocks[index]
      }));
    },
    reset() {
      Object.keys(sharedState).forEach((key) => {
        delete sharedState[key];
      });

      executionContext.runCount = 0;
    }
  };

  targetWindow[EXECUTION_CONTEXT_KEY] = executionContext;
  return executionContext;
}
