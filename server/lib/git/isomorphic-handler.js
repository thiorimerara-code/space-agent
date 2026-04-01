import { createRequire } from "node:module";

import {
  COMMIT_HASH_PATTERN,
  buildHttpAuthOptions,
  createAvailableBackendResult,
  createUnavailableBackendResult,
  fs,
  normalizeBranchName,
  normalizeRemoteUrl,
  shortenOid
} from "./shared.js";

const require = createRequire(import.meta.url);

async function resolveIsomorphicModules() {
  try {
    return {
      git: require("isomorphic-git"),
      http: require("isomorphic-git/http/node")
    };
  } catch (error) {
    throw new Error(error.message);
  }
}

function createRepoOptions(gitContext) {
  return {
    fs,
    dir: gitContext.dir,
    gitdir: gitContext.gitdir
  };
}

function normalizeFetchedDefaultBranch(defaultBranch) {
  return normalizeBranchName(defaultBranch);
}

function isUnstagedMatrixRow([, head, workdir, stage]) {
  if (head === 0 && stage === 0) {
    return false;
  }

  return workdir !== stage;
}

function isStagedMatrixRow([, head, , stage]) {
  return !(head === stage || (head === 0 && stage === 0));
}

export async function createIsomorphicGitClient({ gitContext }) {
  let modules;
  try {
    modules = await resolveIsomorphicModules();
  } catch (error) {
    return createUnavailableBackendResult("isomorphic", error.message);
  }

  const { git, http } = modules;
  const repoOptions = createRepoOptions(gitContext);

  async function resolveRemoteTransport(remoteName) {
    const remoteUrl = await git.getConfig({
      ...repoOptions,
      path: `remote.${remoteName}.url`
    });

    if (!remoteUrl) {
      throw new Error(`Git remote ${remoteName} is not configured.`);
    }

    const transportUrl = normalizeRemoteUrl(remoteUrl);
    return {
      remoteUrl,
      transportUrl,
      ...buildHttpAuthOptions(transportUrl)
    };
  }

  const client = {
    name: "isomorphic",
    label: "isomorphic-git backend",

    async ensureCleanTrackedFiles() {
      const statusRows = await git.statusMatrix({
        ...repoOptions
      });

      if (statusRows.some(isUnstagedMatrixRow)) {
        throw new Error("Update refused because tracked files have unstaged changes. Commit or stash them first.");
      }

      if (statusRows.some(isStagedMatrixRow)) {
        throw new Error("Update refused because tracked files have staged changes. Commit, unstage, or stash them first.");
      }
    },

    async fetchRemote(remoteName) {
      const transport = await resolveRemoteTransport(remoteName);
      const result = await git.fetch({
        ...repoOptions,
        http,
        remote: remoteName,
        url: transport.transportUrl,
        tags: true,
        ...(transport.onAuth ? { onAuth: transport.onAuth } : {})
      });

      return {
        defaultBranch: normalizeFetchedDefaultBranch(result.defaultBranch)
      };
    },

    async readCurrentBranch() {
      return (await git.currentBranch({
        ...repoOptions,
        test: true
      })) || null;
    },

    async hasLocalBranch(branchName) {
      const branches = await git.listBranches(repoOptions);
      return branches.includes(branchName);
    },

    async hasRemoteBranch(remoteName, branchName) {
      const branches = await git.listBranches({
        ...repoOptions,
        remote: remoteName
      });

      return branches.includes(branchName);
    },

    async readConfig(path) {
      const value = await git.getConfig({
        ...repoOptions,
        path
      });

      return value == null ? null : String(value).trim() || null;
    },

    async writeConfig(path, value) {
      await git.setConfig({
        ...repoOptions,
        path,
        value
      });
    },

    async readHeadCommit() {
      return git.resolveRef({
        ...repoOptions,
        ref: "HEAD"
      });
    },

    async readShortCommit(revision = "HEAD") {
      let oid = revision;

      if (!COMMIT_HASH_PATTERN.test(revision) || revision.length < 40) {
        oid = await git.resolveRef({
          ...repoOptions,
          ref: revision
        });
      } else {
        oid = await git.expandOid({
          ...repoOptions,
          oid: revision
        });
      }

      return shortenOid(oid);
    },

    async resolveTagRevision(tagName) {
      try {
        const tagOid = await git.resolveRef({
          ...repoOptions,
          ref: `refs/tags/${tagName}`
        });
        const { oid } = await git.readCommit({
          ...repoOptions,
          oid: tagOid
        });

        return oid;
      } catch {
        return null;
      }
    },

    async resolveCommitRevision(target) {
      if (!COMMIT_HASH_PATTERN.test(target)) {
        return null;
      }

      try {
        const oid = await git.expandOid({
          ...repoOptions,
          oid: target
        });

        await git.readCommit({
          ...repoOptions,
          oid
        });

        return oid;
      } catch {
        return null;
      }
    },

    async checkoutBranch(remoteName, branchName) {
      await git.checkout({
        ...repoOptions,
        remote: remoteName,
        ref: branchName,
        force: true,
        track: true
      });
    },

    async fastForward(remoteName, branchName) {
      const localRef = `refs/heads/${branchName}`;
      const remoteRef = `refs/remotes/${remoteName}/${branchName}`;
      const localOid = await git.resolveRef({
        ...repoOptions,
        ref: localRef
      });
      const remoteOid = await git.resolveRef({
        ...repoOptions,
        ref: remoteRef
      });

      if (localOid === remoteOid) {
        return;
      }

      const canFastForward = await git.isDescendent({
        ...repoOptions,
        oid: remoteOid,
        ancestor: localOid
      });

      if (!canFastForward) {
        throw new Error(`Could not fast-forward ${branchName} to ${remoteName}/${branchName}.`);
      }

      await git.writeRef({
        ...repoOptions,
        ref: localRef,
        value: remoteOid,
        force: true
      });

      await git.checkout({
        ...repoOptions,
        ref: branchName,
        force: true
      });
    },

    async hardReset(revision) {
      const currentBranch = await git.currentBranch({
        ...repoOptions,
        test: true
      });

      if (currentBranch) {
        await git.writeRef({
          ...repoOptions,
          ref: `refs/heads/${currentBranch}`,
          value: revision,
          force: true
        });

        await git.checkout({
          ...repoOptions,
          ref: currentBranch,
          force: true
        });
        return;
      }

      await git.writeRef({
        ...repoOptions,
        ref: "HEAD",
        value: revision,
        force: true,
        symbolic: false
      });

      await git.checkout({
        ...repoOptions,
        force: true
      });
    },

    async checkoutDetached(revision) {
      await git.writeRef({
        ...repoOptions,
        ref: "HEAD",
        value: revision,
        force: true,
        symbolic: false
      });

      await git.checkout({
        ...repoOptions,
        force: true
      });
    }
  };

  return createAvailableBackendResult("isomorphic", client);
}
