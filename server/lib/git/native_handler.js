import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  buildBasicAuthHeader,
  COMMIT_HASH_PATTERN,
  createAvailableBackendResult,
  createUnavailableBackendResult,
  sanitizeRemoteUrl
} from "./shared.js";

function createGitError(args, stderr, stdout) {
  const message = String(stderr || stdout || "git command failed").trim();
  return new Error(`git ${args.join(" ")} failed: ${message}`);
}

function runGit(projectRoot, args, { check = true, cwd = projectRoot } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error) {
    throw result.error;
  }

  if (check && result.status !== 0) {
    throw createGitError(args, result.stderr, result.stdout);
  }

  return result;
}

function readGit(projectRoot, args, options) {
  return runGit(projectRoot, args, options).stdout.trim();
}

function readNativeGitAvailability(cwd) {
  const versionResult = spawnSync("git", ["--version"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (versionResult.error) {
    if (versionResult.error.code === "ENOENT") {
      return {
        available: false,
        reason: "native git is not installed or not on PATH"
      };
    }

    return {
      available: false,
      reason: versionResult.error.message
    };
  }

  if (versionResult.status !== 0) {
    return {
      available: false,
      reason: String(versionResult.stderr || versionResult.stdout || "git --version failed").trim()
    };
  }

  return {
    available: true
  };
}

function buildGitAuthConfigArgs(remoteUrl, authOptions = {}) {
  if (!/^https?:\/\//i.test(String(remoteUrl || "").trim())) {
    return [];
  }

  const authorizationHeader = buildBasicAuthHeader(remoteUrl, authOptions);

  if (!authorizationHeader) {
    return [];
  }

  return ["-c", `http.extraHeader=Authorization: ${authorizationHeader}`];
}

function tryReadRevision(projectRoot, revision) {
  const result = runGit(projectRoot, ["rev-parse", "--verify", "--quiet", revision], { check: false });
  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

function hasLocalBranch(projectRoot, branchName) {
  const result = runGit(projectRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
    check: false
  });

  return result.status === 0;
}

function hasRemoteBranch(projectRoot, remoteName, branchName) {
  const result = runGit(
    projectRoot,
    ["show-ref", "--verify", "--quiet", `refs/remotes/${remoteName}/${branchName}`],
    { check: false }
  );

  return result.status === 0;
}

function readRemoteUrl(projectRoot, remoteName) {
  const result = runGit(projectRoot, ["config", "--local", "--get", `remote.${remoteName}.url`], {
    check: false
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

function readRemoteDefaultBranch(projectRoot, remoteName) {
  const result = runGit(projectRoot, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remoteName}/HEAD`], {
    check: false
  });

  if (result.status !== 0) {
    return null;
  }

  const remoteRef = result.stdout.trim();
  const prefix = `${remoteName}/`;
  if (!remoteRef.startsWith(prefix)) {
    return null;
  }

  return remoteRef.slice(prefix.length) || null;
}

export async function createNativeGitClient({ projectRoot }) {
  const availability = readNativeGitAvailability(projectRoot);
  if (!availability.available) {
    return createUnavailableBackendResult("native", availability.reason);
  }

  const client = {
    name: "native",
    label: "native git backend",

    async ensureCleanTrackedFiles() {
      const unstagedDiff = runGit(projectRoot, ["diff", "--quiet"], { check: false });
      if (unstagedDiff.status === 1) {
        throw new Error("Update refused because tracked files have unstaged changes. Commit or stash them first.");
      }
      if (unstagedDiff.status !== 0) {
        throw createGitError(["diff", "--quiet"], unstagedDiff.stderr, unstagedDiff.stdout);
      }

      const stagedDiff = runGit(projectRoot, ["diff", "--cached", "--quiet"], { check: false });
      if (stagedDiff.status === 1) {
        throw new Error(
          "Update refused because tracked files have staged changes. Commit, unstage, or stash them first."
        );
      }
      if (stagedDiff.status !== 0) {
        throw createGitError(["diff", "--cached", "--quiet"], stagedDiff.stderr, stagedDiff.stdout);
      }
    },

    async fetchRemote(remoteName, authOptions = {}) {
      const remoteUrl = authOptions.remoteUrl || readRemoteUrl(projectRoot, remoteName) || "";

      runGit(projectRoot, [
        ...buildGitAuthConfigArgs(remoteUrl, authOptions),
        "fetch",
        "--tags",
        remoteName
      ]);

      return {
        defaultBranch: readRemoteDefaultBranch(projectRoot, remoteName)
      };
    },

    async readCurrentBranch() {
      return readGit(projectRoot, ["branch", "--show-current"]) || null;
    },

    async hasLocalBranch(branchName) {
      return hasLocalBranch(projectRoot, branchName);
    },

    async hasRemoteBranch(remoteName, branchName) {
      return hasRemoteBranch(projectRoot, remoteName, branchName);
    },

    async readConfig(path) {
      const result = runGit(projectRoot, ["config", "--local", "--get", path], { check: false });
      if (result.status !== 0) {
        return null;
      }

      return result.stdout.trim() || null;
    },

    async writeConfig(path, value) {
      if (value === undefined) {
        runGit(projectRoot, ["config", "--local", "--unset-all", path], { check: false });
        return;
      }

      runGit(projectRoot, ["config", "--local", path, String(value)]);
    },

    async readHeadCommit() {
      return readGit(projectRoot, ["rev-parse", "HEAD"]);
    },

    async readShortCommit(revision = "HEAD") {
      return readGit(projectRoot, ["rev-parse", "--short", revision]);
    },

    async resolveTagRevision(tagName) {
      return tryReadRevision(projectRoot, `refs/tags/${tagName}^{commit}`);
    },

    async resolveCommitRevision(target, remoteName, authOptions = {}) {
      if (!COMMIT_HASH_PATTERN.test(target)) {
        return null;
      }

      let commitRevision = tryReadRevision(projectRoot, `${target}^{commit}`);
      if (commitRevision) {
        return commitRevision;
      }

      const remoteUrl = authOptions.remoteUrl || readRemoteUrl(projectRoot, remoteName) || "";

      runGit(
        projectRoot,
        [...buildGitAuthConfigArgs(remoteUrl, authOptions), "fetch", "--no-tags", remoteName, target],
        { check: false }
      );
      commitRevision = tryReadRevision(projectRoot, `${target}^{commit}`);

      return commitRevision || null;
    },

    async checkoutBranch(remoteName, branchName) {
      if (hasLocalBranch(projectRoot, branchName)) {
        runGit(projectRoot, ["switch", branchName]);
        return;
      }

      runGit(projectRoot, ["switch", "--create", branchName, "--track", `${remoteName}/${branchName}`]);
    },

    async fastForward(remoteName, branchName) {
      runGit(projectRoot, ["merge", "--ff-only", `${remoteName}/${branchName}`]);
    },

    async hardReset(revision) {
      runGit(projectRoot, ["reset", "--hard", revision]);
    },

    async checkoutDetached(revision) {
      runGit(projectRoot, ["checkout", "--detach", revision]);
    }
  };

  return createAvailableBackendResult("native", client);
}

export async function createNativeGitCloneClient({ targetDir }) {
  const availability = readNativeGitAvailability(path.dirname(targetDir));
  if (!availability.available) {
    return createUnavailableBackendResult("native", availability.reason);
  }

  const client = {
    name: "native",
    label: "native git backend",

    async cloneRepository({ authOptions = {}, remoteUrl, targetDir: cloneTargetDir }) {
      const sanitizedRemoteUrl = sanitizeRemoteUrl(remoteUrl);

      runGit(
        path.dirname(cloneTargetDir),
        [...buildGitAuthConfigArgs(remoteUrl, authOptions), "clone", sanitizedRemoteUrl, cloneTargetDir],
        {
          cwd: path.dirname(cloneTargetDir)
        }
      );
    }
  };

  return createAvailableBackendResult("native", client);
}
