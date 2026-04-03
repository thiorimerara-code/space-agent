import { createHttpError, deleteAppPath } from "../lib/customware/file_access.js";
import { normalizeMaxLayer } from "../lib/customware/layer_limit.js";
import { normalizeModuleTargetPath, readModuleInfo } from "../lib/customware/module_manage.js";

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function readTargetPath(context) {
  const payload = readPayload(context);

  return String(payload.path || context.params.path || "");
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
  try {
    const targetPathInfo = normalizeModuleTargetPath(readTargetPath(context), {
      projectRoot: context.projectRoot,
      username: context.user?.username,
      watchdog: context.watchdog
    });
    const result = deleteAppPath({
      path: targetPathInfo.projectPath,
      projectRoot: context.projectRoot,
      username: context.user?.username,
      watchdog: context.watchdog
    });

    await refreshWatchdog(context);

    return {
      action: "deleted",
      path: result.path,
      requestPath: targetPathInfo.requestPath,
      module: await readModuleInfo({
        maxLayer: readMaxLayer(context),
        path: targetPathInfo.requestPath,
        projectRoot: context.projectRoot,
        username: context.user?.username,
        watchdog: context.watchdog
      })
    };
  } catch (error) {
    throw createHttpError(error.message || "Module remove failed.", Number(error.statusCode) || 500);
  }
}
