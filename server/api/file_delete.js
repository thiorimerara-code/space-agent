import { createHttpError, deleteAppPath, deleteAppPaths } from "../lib/customware/file_access.js";

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function readPath(context) {
  const payload = readPayload(context);
  return String(payload.path || context.params.path || "");
}

function hasBatchDelete(payload) {
  return Boolean(payload) && typeof payload === "object" && Array.isArray(payload.paths);
}

async function handleDelete(context) {
  const payload = readPayload(context);

  try {
    const options = {
      path: readPath(context),
      paths: payload.paths,
      projectRoot: context.projectRoot,
      username: context.user?.username,
      watchdog: context.watchdog
    };
    const result = hasBatchDelete(payload) ? deleteAppPaths(options) : deleteAppPath(options);

    if (context.watchdog && typeof context.watchdog.refresh === "function") {
      await context.watchdog.refresh();
    }

    return result;
  } catch (error) {
    throw createHttpError(error.message || "File delete failed.", Number(error.statusCode) || 500);
  }
}

export function post(context) {
  return handleDelete(context);
}

export { handleDelete as delete };
