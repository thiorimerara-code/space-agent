import { createIsomorphicGitClient, createIsomorphicGitCloneClient } from "./isomorphic_handler.js";
import { createNativeGitClient, createNativeGitCloneClient } from "./native_handler.js";
import { createNodeGitClient, createNodeGitCloneClient } from "./nodegit_handler.js";
import { assertGitClient } from "./client_interface.js";
import { normalizeBackendName, resolveGitContext } from "./shared.js";

const BACKEND_FACTORIES = {
  native: createNativeGitClient,
  nodegit: createNodeGitClient,
  isomorphic: createIsomorphicGitClient
};

const CLONE_BACKEND_FACTORIES = {
  native: createNativeGitCloneClient,
  nodegit: createNodeGitCloneClient,
  isomorphic: createIsomorphicGitCloneClient
};

const DEFAULT_BACKEND_ORDER = ["native", "nodegit", "isomorphic"];

function buildUnavailableBackendMessage(attempts) {
  return attempts
    .map((attempt) => `${attempt.name}: ${attempt.reason}`)
    .join("; ");
}

function resolveBackendOrder() {
  const requestedBackend = normalizeBackendName(process.env.SPACE_GIT_BACKEND);

  return {
    backendOrder: requestedBackend ? [requestedBackend] : DEFAULT_BACKEND_ORDER,
    requestedBackend
  };
}

export async function createGitClient({ projectRoot }) {
  const gitContext = await resolveGitContext(projectRoot);
  const { backendOrder, requestedBackend } = resolveBackendOrder();
  const attempts = [];

  for (const backendName of backendOrder) {
    const result = await BACKEND_FACTORIES[backendName]({ projectRoot, gitContext });
    attempts.push(result);

    if (result.available) {
      assertGitClient(result.client, backendName);
      return result.client;
    }
  }

  const message = buildUnavailableBackendMessage(attempts);
  if (requestedBackend) {
    throw new Error(`Requested git backend "${requestedBackend}" is not available: ${message}`);
  }

  throw new Error(`Update could not initialize a Git backend: ${message}`);
}

export async function cloneGitRepository({ authOptions = {}, remoteUrl, targetDir }) {
  const { backendOrder, requestedBackend } = resolveBackendOrder();
  const attempts = [];

  for (const backendName of backendOrder) {
    const result = await CLONE_BACKEND_FACTORIES[backendName]({ remoteUrl, targetDir });
    attempts.push(result);

    if (result.available) {
      await result.client.cloneRepository({
        authOptions,
        remoteUrl,
        targetDir
      });
      return result.client;
    }
  }

  const message = buildUnavailableBackendMessage(attempts);
  if (requestedBackend) {
    throw new Error(`Requested git backend "${requestedBackend}" is not available: ${message}`);
  }

  throw new Error(`Module install could not initialize a Git backend: ${message}`);
}
