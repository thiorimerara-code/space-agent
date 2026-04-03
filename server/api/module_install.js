import { createHttpError } from "../lib/customware/file_access.js";
import { normalizeMaxLayer } from "../lib/customware/layer_limit.js";
import { installModule, readModuleInfo } from "../lib/customware/module_manage.js";

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function readTargetPath(context) {
  const payload = readPayload(context);

  return String(payload.path || context.params.path || "");
}

function readRepositoryUrl(context) {
  const payload = readPayload(context);

  return String(
    payload.repoUrl ||
      payload.repo_url ||
      payload.repositoryUrl ||
      payload.repository_url ||
      ""
  ).trim();
}

function readRevision(value) {
  return String(value || "").trim();
}

function readMaxLayer(context) {
  const payload = readPayload(context);

  return normalizeMaxLayer(payload.maxLayer ?? context.params.maxLayer);
}

async function refreshWatchdog(context) {
  if (context.watchdog && typeof context.watchdog.refresh === "function") {
    await context.watchdog.refresh();
  }
}

export async function post(context) {
  const payload = readPayload(context);

  try {
    const result = await installModule({
      commit: readRevision(payload.commit),
      path: readTargetPath(context),
      projectRoot: context.projectRoot,
      repoUrl: readRepositoryUrl(context),
      tag: readRevision(payload.tag),
      token: readRevision(payload.token),
      username: context.user?.username,
      watchdog: context.watchdog
    });

    await refreshWatchdog(context);

    return {
      ...result,
      module: await readModuleInfo({
        maxLayer: readMaxLayer(context),
        path: result.requestPath,
        projectRoot: context.projectRoot,
        username: context.user?.username,
        watchdog: context.watchdog
      })
    };
  } catch (error) {
    throw createHttpError(error.message || "Module install failed.", Number(error.statusCode) || 500);
  }
}
