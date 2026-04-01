const fs = require("node:fs");
const path = require("node:path");
const { globToRegExp, normalizePathSegment } = require("../../app-files");

const REFRESH_DEBOUNCE_MS = 75;
const RECONCILE_INTERVAL_MS = 1_000;

function tryReadTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function tryStat(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function normalizeProjectPath(input) {
  const normalized = normalizePathSegment(input);
  return normalized ? `/${normalized}` : "";
}

function toProjectPath(projectRoot, absolutePath) {
  return normalizeProjectPath(path.relative(projectRoot, absolutePath));
}

function parseScalar(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseFileWatchYaml(sourceText) {
  const result = {};
  let currentKey = null;

  String(sourceText || "")
    .split(/\r?\n/u)
    .forEach((rawLine) => {
      const line = rawLine.replace(/\s+#.*$/u, "").trimEnd();

      if (!line.trim()) {
        return;
      }

      const keyMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s+(.*))?$/u);
      if (keyMatch) {
        const [, key, value] = keyMatch;
        currentKey = key;

        if (value === undefined || value === "") {
          result[key] = [];
          return;
        }

        result[key] = parseScalar(value);
        return;
      }

      const listMatch = line.match(/^\s*-\s+(.*)$/u);
      if (listMatch && currentKey) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }

        result[currentKey].push(parseScalar(listMatch[1]));
      }
    });

  return result;
}

function loadFileWatchConfig(configPath) {
  const sourceText = tryReadTextFile(configPath);

  if (sourceText === null) {
    throw new Error(`File watch config not found: ${configPath}`);
  }

  const parsed = parseFileWatchYaml(sourceText);
  const rawPaths = Array.isArray(parsed.paths) ? parsed.paths : [];
  const patterns = rawPaths
    .filter((value) => typeof value === "string")
    .map((value) => normalizeProjectPath(value))
    .filter(Boolean);

  if (patterns.length === 0) {
    throw new Error(`File watch config must define at least one path under "paths": ${configPath}`);
  }

  return {
    configPath,
    patterns
  };
}

function getFixedPatternPrefix(pattern) {
  const relativePattern = normalizePathSegment(pattern);
  const segments = relativePattern ? relativePattern.split("/") : [];
  const prefixSegments = [];

  for (const segment of segments) {
    if (/[*?[\]{}]/u.test(segment)) {
      break;
    }

    prefixSegments.push(segment);
  }

  return prefixSegments.join("/");
}

function getExistingWatchBase(projectRoot, relativePath) {
  let currentPath = relativePath ? path.join(projectRoot, relativePath) : projectRoot;

  while (true) {
    const stats = tryStat(currentPath);
    if (stats && stats.isDirectory()) {
      return currentPath;
    }

    if (currentPath === projectRoot) {
      return projectRoot;
    }

    currentPath = path.dirname(currentPath);
  }
}

function walkDirectories(startDir, output) {
  const stats = tryStat(startDir);
  if (!stats || !stats.isDirectory()) {
    return;
  }

  output.add(startDir);

  const entries = fs.readdirSync(startDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    walkDirectories(path.join(startDir, entry.name), output);
  }
}

function walkFiles(startDir, callback) {
  const stats = tryStat(startDir);
  if (!stats || !stats.isDirectory()) {
    return;
  }

  const entries = fs.readdirSync(startDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(startDir, entry.name);

    if (entry.isDirectory()) {
      walkFiles(fullPath, callback);
      continue;
    }

    if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

function createCompiledPatterns(patterns) {
  return patterns.map((pattern) => {
    const normalized = normalizePathSegment(pattern);

    return {
      pattern: normalizeProjectPath(pattern),
      matcher: globToRegExp(normalized)
    };
  });
}

function createFileAggregateStore(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || path.join(__dirname, "..", "..", ".."));
  const configPath = path.resolve(options.configPath || path.join(__dirname, "config.yaml"));
  const reconcileIntervalMs = Number(options.reconcileIntervalMs || RECONCILE_INTERVAL_MS);
  let compiledPatterns = [];
  let matchedPathIndex = Object.create(null);
  let started = false;
  let refreshInProgress = false;
  let pendingRefresh = false;
  let refreshTimer = null;
  let reconcileTimer = null;
  let configWatcher = null;
  const directoryWatchers = new Map();
  const aggregateBuilders = new Map();
  const aggregateValues = new Map();

  function coversPath(projectPath) {
    const normalized = normalizePathSegment(projectPath);
    return Boolean(normalized && compiledPatterns.some(({ matcher }) => matcher.test(normalized)));
  }

  function hasPath(projectPath) {
    const normalized = normalizeProjectPath(projectPath);
    return Boolean(normalized && matchedPathIndex[normalized]);
  }

  function getMatchedPathIndex() {
    return { ...matchedPathIndex };
  }

  function getMatchedPaths() {
    return Object.keys(matchedPathIndex).sort((left, right) => left.localeCompare(right));
  }

  function rebuildAggregates() {
    const aggregateContext = {
      coversPath,
      getMatchedPathIndex,
      getMatchedPaths,
      matchedPathIndex: getMatchedPathIndex(),
      matchedPaths: getMatchedPaths(),
      projectRoot
    };

    for (const [name, buildAggregate] of aggregateBuilders.entries()) {
      aggregateValues.set(name, buildAggregate(aggregateContext));
    }
  }

  function registerAggregate(name, buildAggregate) {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Aggregate name must be a non-empty string.");
    }

    if (typeof buildAggregate !== "function") {
      throw new Error(`Aggregate builder for ${name} must be a function.`);
    }

    aggregateBuilders.set(name, buildAggregate);
    rebuildAggregates();
  }

  function getAggregate(name) {
    return aggregateValues.get(name);
  }

  function rebuildMatchedPathIndex() {
    const nextMatchedPathIndex = Object.create(null);
    const scanRoots = new Set();

    for (const { pattern } of compiledPatterns) {
      const fixedPrefix = getFixedPatternPrefix(pattern);
      scanRoots.add(fixedPrefix ? path.join(projectRoot, fixedPrefix) : projectRoot);
    }

    for (const scanRoot of scanRoots) {
      walkFiles(scanRoot, (filePath) => {
        const projectPath = toProjectPath(projectRoot, filePath);
        const normalized = normalizePathSegment(projectPath);

        if (!normalized) {
          return;
        }

        if (!compiledPatterns.some(({ matcher }) => matcher.test(normalized))) {
          return;
        }

        nextMatchedPathIndex[projectPath] = true;
      });
    }

    matchedPathIndex = nextMatchedPathIndex;
  }

  function closeRemovedWatchers(nextDirectorySet) {
    for (const [directoryPath, watcher] of directoryWatchers.entries()) {
      if (nextDirectorySet.has(directoryPath)) {
        continue;
      }

      watcher.close();
      directoryWatchers.delete(directoryPath);
    }
  }

  async function refresh() {
    if (refreshInProgress) {
      pendingRefresh = true;
      return;
    }

    refreshInProgress = true;

    try {
      const nextConfig = loadFileWatchConfig(configPath);
      compiledPatterns = createCompiledPatterns(nextConfig.patterns);
      rebuildMatchedPathIndex();

      const nextDirectories = new Set();

      for (const { pattern } of compiledPatterns) {
        const fixedPrefix = getFixedPatternPrefix(pattern);
        const baseDirectory = getExistingWatchBase(projectRoot, fixedPrefix);
        walkDirectories(baseDirectory, nextDirectories);
      }

      closeRemovedWatchers(nextDirectories);

      for (const directoryPath of nextDirectories) {
        if (directoryWatchers.has(directoryPath)) {
          continue;
        }

        try {
          const watcher = fs.watch(directoryPath, () => {
            scheduleRefresh();
          });

          watcher.on("error", () => {
            scheduleRefresh();
          });

          directoryWatchers.set(directoryPath, watcher);
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
        }
      }

      rebuildAggregates();
    } finally {
      refreshInProgress = false;

      if (pendingRefresh) {
        pendingRefresh = false;
        await refresh();
      }
    }
  }

  async function refreshSafely() {
    try {
      await refresh();
    } catch (error) {
      console.error("Failed to refresh watched file aggregates.");
      console.error(error);
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshSafely();
    }, REFRESH_DEBOUNCE_MS);
  }

  function startConfigWatcher() {
    const configDirectory = path.dirname(configPath);
    const configFileName = path.basename(configPath);

    configWatcher = fs.watch(configDirectory, (eventType, fileName) => {
      if (fileName && String(fileName) !== configFileName) {
        return;
      }

      scheduleRefresh();
    });

    configWatcher.on("error", () => {
      scheduleRefresh();
    });
  }

  function startReconcileLoop() {
    if (!Number.isFinite(reconcileIntervalMs) || reconcileIntervalMs <= 0) {
      return;
    }

    reconcileTimer = setInterval(() => {
      void refreshSafely();
    }, reconcileIntervalMs);
  }

  async function start() {
    if (started) {
      return;
    }

    await refresh();
    startConfigWatcher();
    startReconcileLoop();
    started = true;
  }

  function stop() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    if (configWatcher) {
      configWatcher.close();
      configWatcher = null;
    }

    if (reconcileTimer) {
      clearInterval(reconcileTimer);
      reconcileTimer = null;
    }

    for (const watcher of directoryWatchers.values()) {
      watcher.close();
    }

    directoryWatchers.clear();
    started = false;
  }

  return {
    coversPath,
    getAggregate,
    getMatchedPathIndex,
    getMatchedPaths,
    hasPath,
    refresh,
    registerAggregate,
    start,
    stop
  };
}

module.exports = {
  createFileAggregateStore,
  loadFileWatchConfig,
  normalizeProjectPath,
  toProjectPath
};
