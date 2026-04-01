import { createIsomorphicGitClient } from "./isomorphic-handler.js";
import { createNativeGitClient } from "./native-handler.js";
import { createNodeGitClient } from "./nodegit-handler.js";
import { assertGitClient } from "./client-interface.js";
import { normalizeBackendName, resolveGitContext } from "./shared.js";

const BACKEND_FACTORIES = {
  native: createNativeGitClient,
  nodegit: createNodeGitClient,
  isomorphic: createIsomorphicGitClient
};

const DEFAULT_BACKEND_ORDER = ["native", "nodegit", "isomorphic"];

function buildUnavailableBackendMessage(attempts) {
  return attempts
    .map((attempt) => `${attempt.name}: ${attempt.reason}`)
    .join("; ");
}

export async function createGitClient({ projectRoot }) {
  const gitContext = await resolveGitContext(projectRoot);
  const requestedBackend = normalizeBackendName(process.env.A1_GIT_BACKEND);
  const backendOrder = requestedBackend ? [requestedBackend] : DEFAULT_BACKEND_ORDER;
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
