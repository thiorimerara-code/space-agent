const { createFileAggregateStore, normalizeProjectPath, toProjectPath } = require("./store.cjs");

function buildPathIndexAggregate(context) {
  return context.matchedPathIndex;
}

function createFileIndex(options = {}) {
  const store = createFileAggregateStore(options);
  store.registerAggregate("pathIndex", buildPathIndexAggregate);

  return {
    covers(projectPath) {
      return store.coversPath(projectPath);
    },
    getAggregate(name) {
      return store.getAggregate(name);
    },
    getMatchedPathIndex() {
      return store.getMatchedPathIndex();
    },
    getMatchedPaths() {
      return store.getMatchedPaths();
    },
    getSnapshot() {
      return store.getAggregate("pathIndex") || {};
    },
    has(projectPath) {
      const normalized = normalizeProjectPath(projectPath);
      const pathIndex = store.getAggregate("pathIndex") || {};
      return Boolean(normalized && pathIndex[normalized]);
    },
    refresh() {
      return store.refresh();
    },
    registerAggregate(name, buildAggregate) {
      store.registerAggregate(name, buildAggregate);
      return this;
    },
    start() {
      return store.start();
    },
    stop() {
      return store.stop();
    }
  };
}

module.exports = {
  buildPathIndexAggregate,
  createFileIndex,
  normalizeProjectPath,
  toProjectPath
};
