import { createHttpError, writeAppFile, writeAppFiles } from "../lib/customware/file_access.js";

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function hasBatchWrite(payload) {
  return Boolean(payload) && typeof payload === "object" && Array.isArray(payload.files);
}

export async function post(context) {
  const payload = readPayload(context);

  try {
    const options = {
      content: payload.content,
      encoding: String(payload.encoding || "utf8"),
      path: String(payload.path || context.params.path || ""),
      projectRoot: context.projectRoot,
      username: context.user?.username,
      watchdog: context.watchdog
    };
    const result = hasBatchWrite(payload)
      ? writeAppFiles({
          ...options,
          files: payload.files
        })
      : writeAppFile(options);

    if (context.watchdog && typeof context.watchdog.refresh === "function") {
      await context.watchdog.refresh();
    }

    return result;
  } catch (error) {
    throw createHttpError(error.message || "File write failed.", Number(error.statusCode) || 500);
  }
}
