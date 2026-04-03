import { createHttpError } from "../lib/customware/file_access.js";
import { listInstalledModules } from "../lib/customware/module_manage.js";

export async function get(context) {
  try {
    return await listInstalledModules({
      projectRoot: context.projectRoot,
      username: context.user?.username,
      watchdog: context.watchdog
    });
  } catch (error) {
    throw createHttpError(error.message || "Module list failed.", Number(error.statusCode) || 500);
  }
}
