import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

export const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;
export const SUPPORTED_GIT_BACKENDS = new Set(["native", "nodegit", "isomorphic"]);

export function createAvailableBackendResult(name, client) {
  return {
    name,
    available: true,
    client
  };
}

export function createUnavailableBackendResult(name, reason) {
  return {
    name,
    available: false,
    reason
  };
}

export function createSourceCheckoutError() {
  return new Error("The update command is only available for source installs in a real Git checkout.");
}

export function normalizeBackendName(rawValue) {
  if (!rawValue) {
    return null;
  }

  const normalizedValue = String(rawValue).trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  if (!SUPPORTED_GIT_BACKENDS.has(normalizedValue)) {
    throw new Error(
      `Unsupported A1_GIT_BACKEND value "${rawValue}". Expected one of: native, nodegit, isomorphic.`
    );
  }

  return normalizedValue;
}

export function normalizeBranchName(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  if (value.startsWith("refs/heads/")) {
    return value.slice("refs/heads/".length) || null;
  }

  return value;
}

export function shortenOid(oid) {
  return String(oid || "").slice(0, 7);
}

export async function resolveGitContext(projectRoot) {
  const dotGitPath = path.join(projectRoot, ".git");

  let stat;
  try {
    stat = await fsPromises.stat(dotGitPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw createSourceCheckoutError();
    }
    throw error;
  }

  if (stat.isDirectory()) {
    return {
      dir: projectRoot,
      gitdir: dotGitPath
    };
  }

  if (!stat.isFile()) {
    throw createSourceCheckoutError();
  }

  const pointerFile = await fsPromises.readFile(dotGitPath, "utf8");
  const match = /^gitdir:\s*(.+)\s*$/im.exec(pointerFile);
  if (!match) {
    throw createSourceCheckoutError();
  }

  return {
    dir: projectRoot,
    gitdir: path.resolve(projectRoot, match[1].trim())
  };
}

export function isSshLikeRemoteUrl(remoteUrl) {
  const value = String(remoteUrl || "").trim();
  if (!value) {
    return false;
  }

  return /^[^/@\s]+@[^:/\s]+:.+$/.test(value) || /^ssh:\/\//i.test(value);
}

export function normalizeRemoteUrl(remoteUrl) {
  const value = String(remoteUrl || "").trim();
  if (!value) {
    throw new Error("The configured Git remote URL is empty.");
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (/^git:\/\//i.test(value) || /^ssh:\/\//i.test(value)) {
    const url = new URL(value);
    return `https://${url.host}${url.pathname}`;
  }

  const scpLikeMatch = /^(?:[^@]+@)?([^:]+):(.+)$/.exec(value);
  if (scpLikeMatch) {
    return `https://${scpLikeMatch[1]}/${scpLikeMatch[2].replace(/^\/+/, "")}`;
  }

  throw new Error(
    `isomorphic-git requires an HTTP(S) remote. Unsupported remote URL: ${value}`
  );
}

export function buildHttpAuthOptions(remoteUrl, env = process.env) {
  const token =
    env.AGENT_ONE_GIT_TOKEN ||
    env.GITHUB_TOKEN ||
    env.GH_TOKEN ||
    null;

  if (token) {
    const username = env.AGENT_ONE_GIT_USERNAME || env.GIT_USERNAME || "git";

    return {
      onAuth() {
        return {
          username,
          password: token
        };
      }
    };
  }

  try {
    const parsedUrl = new URL(remoteUrl);
    if (parsedUrl.username || parsedUrl.password) {
      return {
        onAuth() {
          return {
            username: decodeURIComponent(parsedUrl.username),
            password: decodeURIComponent(parsedUrl.password)
          };
        }
      };
    }
  } catch {
    // Ignore URL parsing problems here. The caller already validated the URL.
  }

  return {};
}

export { fs };
