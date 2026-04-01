import { spawnSync } from "node:child_process";

import {
  COMMIT_HASH_PATTERN,
  createAvailableBackendResult,
  createUnavailableBackendResult
} from "./shared.js";

function createGitError(args, stderr, stdout) {
  const message = String(stderr || stdout || "git command failed").trim();
  return new Error(`git ${args.join(" ")} failed: ${message}`);
}

function runGit(projectRoot, args, { check = true } = {}) {
  const result = spawnSync("git", args, {
    cwd: projectRoot,
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
  const versionResult = spawnSync("git", ["--version"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (versionResult.error) {
    if (versionResult.error.code === "ENOENT") {
      return createUnavailableBackendResult("native", "native git is not installed or not on PATH");
    }

    return createUnavailableBackendResult("native", versionResult.error.message);
  }

  if (versionResult.status !== 0) {
    return createUnavailableBackendResult(
      "native",
      String(versionResult.stderr || versionResult.stdout || "git --version failed").trim()
    );
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

    async fetchRemote(remoteName) {
      runGit(projectRoot, ["fetch", "--tags", remoteName]);
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

    async resolveCommitRevision(target, remoteName) {
      if (!COMMIT_HASH_PATTERN.test(target)) {
        return null;
      }

      let commitRevision = tryReadRevision(projectRoot, `${target}^{commit}`);
      if (commitRevision) {
        return commitRevision;
      }

      runGit(projectRoot, ["fetch", "--no-tags", remoteName, target], { check: false });
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
