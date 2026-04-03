import { createHttpError } from "../lib/customware/file_access.js";
import { normalizeMaxLayer } from "../lib/customware/layer_limit.js";
import { readModuleInfo } from "../lib/customware/module_manage.js";

function readPayload(context) {
  return context.body && typeof context.body === "object" && !Buffer.isBuffer(context.body)
    ? context.body
    : {};
}

function readInfoPath(context) {
  const payload = readPayload(context);

  return String(
    context.params.path ||
      context.params.modulePath ||
      context.params.module_path ||
      payload.path ||
      payload.modulePath ||
      payload.module_path ||
      ""
  );
}

function readMaxLayer(context) {
  const payload = readPayload(context);

  return normalizeMaxLayer(payload.maxLayer ?? context.params.maxLayer);
}

export async function get(context) {
  try {
    return await readModuleInfo({
      maxLayer: readMaxLayer(context),
      path: readInfoPath(context),
      projectRoot: context.projectRoot,
      username: context.user?.username,
      watchdog: context.watchdog
    });
  } catch (error) {
    throw createHttpError(error.message || "Module info lookup failed.", Number(error.statusCode) || 500);
  }
}
