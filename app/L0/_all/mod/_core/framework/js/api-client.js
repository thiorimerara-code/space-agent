/**
 * @typedef {string | number | boolean | null | undefined | Array<string | number | boolean>} ApiQueryValue
 */

/**
 * @typedef {{
 *   method?: string,
 *   query?: Record<string, ApiQueryValue>,
 *   body?: unknown,
 *   headers?: Record<string, string>,
 *   signal?: AbortSignal
 * }} ApiCallOptions
 */

/**
 * @typedef {{
 *   path: string,
 *   content?: string,
 *   encoding?: string,
 *   bytesWritten?: number
 * }} FileApiEntry
 */

/**
 * @typedef {{
 *   endpoint?: string,
 *   recursive?: boolean,
 *   paths?: string[],
 *   path: string,
 *   content?: string,
 *   encoding?: string,
 *   bytesWritten?: number
 * }} FileApiResult
 */

/**
 * @typedef {{
 *   count: number,
 *   files: FileApiEntry[],
 *   bytesWritten?: number
 * }} FileBatchApiResult
 */

/**
 * @typedef {{
 *   count: number,
 *   paths: string[]
 * }} PathBatchApiResult
 */

/**
 * @typedef {string | { path: string, encoding?: string }} FileReadInput
 */

/**
 * @typedef {{ files: FileReadInput[], encoding?: string }} FileReadBatchOptions
 */

/**
 * @typedef {{ path: string, content?: string, encoding?: string }} FileWriteInput
 */

/**
 * @typedef {{ files: FileWriteInput[], encoding?: string }} FileWriteBatchOptions
 */

/**
 * @typedef {string | { path: string }} FileDeleteInput
 */

/**
 * @typedef {{ paths: FileDeleteInput[] }} FileDeleteBatchOptions
 */

/**
 * @typedef {{
 *   fullName: string,
 *   groups: string[],
 *   isAdmin: boolean,
 *   managedGroups: string[],
 *   username: string
 * }} UserSelfInfoResult
 */

function appendQueryValue(searchParams, key, value) {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryValue(searchParams, key, item));
    return;
  }

  searchParams.append(key, String(value));
}

function buildApiUrl(basePath, endpointName, query) {
  const url = new URL(`${basePath.replace(/\/$/, "")}/${endpointName}`, window.location.origin);

  Object.entries(query || {}).forEach(([key, value]) => {
    appendQueryValue(url.searchParams, key, value);
  });

  return url;
}

async function parseApiResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  if (contentType.startsWith("text/") || contentType.includes("xml")) {
    return response.text();
  }

  return response.blob();
}

async function createApiError(endpointName, response) {
  let detail = response.statusText || "Request failed";

  try {
    const payload = await parseApiResponse(response);

    if (payload && typeof payload === "object" && "error" in payload) {
      detail =
        typeof payload.error === "string"
          ? payload.error
          : JSON.stringify(payload.error, null, 2);
    } else if (typeof payload === "string" && payload.trim()) {
      detail = payload;
    }
  } catch (error) {
    detail = response.statusText || "Request failed";
  }

  return new Error(`API ${endpointName} failed with status ${response.status}: ${detail}`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createFileReadRequest(pathOrFiles, encoding) {
  if (Array.isArray(pathOrFiles)) {
    return {
      method: "POST",
      body: {
        encoding,
        files: pathOrFiles
      }
    };
  }

  if (isPlainObject(pathOrFiles) && Array.isArray(pathOrFiles.files)) {
    return {
      method: "POST",
      body: {
        encoding: pathOrFiles.encoding ?? encoding,
        files: pathOrFiles.files
      }
    };
  }

  if (isPlainObject(pathOrFiles) && typeof pathOrFiles.path === "string") {
    return {
      method: "POST",
      body: {
        encoding: pathOrFiles.encoding ?? encoding,
        path: pathOrFiles.path
      }
    };
  }

  return {
    method: "GET",
    query: {
      encoding,
      path: pathOrFiles
    }
  };
}

function createFileWriteRequest(pathOrFiles, content, encoding) {
  if (Array.isArray(pathOrFiles)) {
    return {
      method: "POST",
      body: {
        encoding,
        files: pathOrFiles
      }
    };
  }

  if (isPlainObject(pathOrFiles) && Array.isArray(pathOrFiles.files)) {
    return {
      method: "POST",
      body: {
        encoding: pathOrFiles.encoding ?? encoding,
        files: pathOrFiles.files
      }
    };
  }

  if (isPlainObject(pathOrFiles) && typeof pathOrFiles.path === "string") {
    return {
      method: "POST",
      body: {
        content: pathOrFiles.content,
        encoding: pathOrFiles.encoding ?? encoding,
        path: pathOrFiles.path
      }
    };
  }

  return {
    method: "POST",
    body: {
      content,
      encoding,
      path: pathOrFiles
    }
  };
}

function createFileDeleteRequest(pathOrPaths) {
  if (Array.isArray(pathOrPaths)) {
    return {
      method: "POST",
      body: {
        paths: pathOrPaths
      }
    };
  }

  if (isPlainObject(pathOrPaths) && Array.isArray(pathOrPaths.paths)) {
    return {
      method: "POST",
      body: {
        paths: pathOrPaths.paths
      }
    };
  }

  if (isPlainObject(pathOrPaths) && typeof pathOrPaths.path === "string") {
    return {
      method: "POST",
      body: {
        path: pathOrPaths.path
      }
    };
  }

  return {
    method: "POST",
    body: {
      path: pathOrPaths
    }
  };
}

export function createApiClient(options = {}) {
  const basePath = options.basePath || "/api";

  /**
   * Universal server API caller for `/api/<endpoint>` modules.
   *
   * @template T
   * @param {string} endpointName
   * @param {ApiCallOptions} [callOptions]
   * @returns {Promise<T>}
   */
  async function call(endpointName, callOptions = {}) {
    const method = String(callOptions.method || "GET").toUpperCase();
    const url = buildApiUrl(basePath, endpointName, callOptions.query);
    const headers = new Headers(callOptions.headers || {});
    const init = {
      method,
      headers,
      signal: callOptions.signal
    };

    if (!["GET", "HEAD"].includes(method) && callOptions.body !== undefined) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const contentType = headers.get("Content-Type") || "";
      init.body =
        contentType.includes("application/json") && typeof callOptions.body !== "string"
          ? JSON.stringify(callOptions.body)
          : callOptions.body;
    }

    let response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      throw new Error(`API ${endpointName} request failed: ${error.message}`);
    }

    if (!response.ok) {
      throw await createApiError(endpointName, response);
    }

    return /** @type {Promise<T>} */ (parseApiResponse(response));
  }

  /**
   * @returns {Promise<{ ok: boolean, name: string, browserAppUrl: string, responsibilities: string[] }>}
   */
  async function health() {
    return call("health");
  }

  /**
   * Read an authenticated app file.
   * `fileRead()` accepts app-rooted paths such as `L2/alice/note.txt` and the
   * `~` or `~/...` shorthand for the current user's `L2/<username>/...` path.
   * It also accepts composed batch input through a `files` array.
   *
   * @param {string | FileReadInput[] | FileReadBatchOptions | FileReadInput} pathOrFiles
   * @param {string} [encoding]
   * @returns {Promise<FileApiResult | FileBatchApiResult>}
   */
  async function fileRead(pathOrFiles, encoding = "utf8") {
    return call("file_read", createFileReadRequest(pathOrFiles, encoding));
  }

  /**
   * Write an authenticated app file.
   * `fileWrite()` accepts app-rooted paths such as `L2/alice/note.txt` and the
   * `~` or `~/...` shorthand for the current user's `L2/<username>/...` path.
   * Paths that end with `/` create directories instead of writing files.
   * It also accepts composed batch input through a `files` array.
   *
   * @param {string | FileWriteInput[] | FileWriteBatchOptions | FileWriteInput} pathOrFiles
   * @param {string} [content]
   * @param {string} [encoding]
   * @returns {Promise<FileApiResult | FileBatchApiResult>}
   */
  async function fileWrite(pathOrFiles, content, encoding = "utf8") {
    return call("file_write", createFileWriteRequest(pathOrFiles, content, encoding));
  }

  /**
   * Delete authenticated app paths.
   * `fileDelete()` accepts app-rooted paths such as `L2/alice/note.txt`,
   * `L2/alice/old-folder/`, and the `~` or `~/...` shorthand for the current
   * user's `L2/<username>/...` path. Directory deletes are recursive.
   *
   * @param {string | FileDeleteInput[] | FileDeleteBatchOptions | FileDeleteInput} pathOrPaths
   * @returns {Promise<FileApiResult | PathBatchApiResult>}
   */
  async function fileDelete(pathOrPaths) {
    return call("file_delete", createFileDeleteRequest(pathOrPaths));
  }

  /**
   * List authenticated app paths.
   * `fileList()` accepts app-rooted paths such as `L2/alice/` and the
   * `~` or `~/...` shorthand for the current user's `L2/<username>/...` path.
   *
   * @param {string} path
   * @param {boolean} [recursive]
   * @returns {Promise<FileApiResult>}
   */
  async function fileList(path, recursive = false) {
    return call("file_list", {
      method: "GET",
      query: {
        path,
        recursive
      }
    });
  }

  /**
   * Return the authenticated user's derived profile snapshot from the backend.
   *
   * @returns {Promise<UserSelfInfoResult>}
   */
  async function userSelfInfo() {
    return call("user_self_info", {
      method: "GET"
    });
  }

  return {
    call,
    fileDelete,
    fileList,
    fileRead,
    fileWrite,
    health,
    userSelfInfo
  };
}
