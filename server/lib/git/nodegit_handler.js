import {
  COMMIT_HASH_PATTERN,
  createAvailableBackendResult,
  createUnavailableBackendResult,
  isSshLikeRemoteUrl,
  normalizeBranchName,
  resolveGitAuth,
  sanitizeRemoteUrl,
  shortenOid
} from "./shared.js";

function readNodeGitText(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.ptr === "string") {
    return value.ptr;
  }

  if (typeof value.tostrS === "function") {
    return value.tostrS();
  }

  return String(value);
}

function readReferenceName(reference) {
  if (!reference) {
    return null;
  }

  if (typeof reference.shorthand === "function") {
    return reference.shorthand();
  }

  if (typeof reference.name === "function") {
    const fullName = reference.name();
    if (fullName.startsWith("refs/heads/")) {
      return fullName.slice("refs/heads/".length);
    }
    return fullName;
  }

  return null;
}

function oidToString(oid) {
  if (!oid) {
    return null;
  }

  if (typeof oid === "string") {
    return oid;
  }

  if (typeof oid.tostrS === "function") {
    return oid.tostrS();
  }

  return String(oid);
}

function checkoutOptions(NodeGit) {
  return {
    checkoutStrategy: NodeGit.Checkout?.STRATEGY?.FORCE
  };
}

function readStatusValue(entry) {
  if (typeof entry?.status === "function") {
    return entry.status();
  }

  return entry?.status || 0;
}

function createFetchOptions(NodeGit, remoteUrl, authOptions = {}) {
  const auth = resolveGitAuth(remoteUrl, authOptions);
  const callbacks = {
    certificateCheck() {
      return 1;
    }
  };

  if (auth.token) {
    callbacks.credentials = () => NodeGit.Cred.userpassPlaintextNew(auth.username || "git", auth.token);
  } else if (isSshLikeRemoteUrl(remoteUrl) && typeof NodeGit.Cred?.sshKeyFromAgent === "function") {
    callbacks.credentials = (_url, userName) => NodeGit.Cred.sshKeyFromAgent(userName || "git");
  }

  const fetchOptions = {
    callbacks
  };

  if (NodeGit.Remote?.AUTOTAG_OPTION?.ALL !== undefined) {
    fetchOptions.downloadTags = NodeGit.Remote.AUTOTAG_OPTION.ALL;
  }

  return fetchOptions;
}

async function resolveCommitObject(repo, NodeGit, revision) {
  if (revision === "HEAD") {
    return repo.getHeadCommit();
  }

  if (revision.startsWith("refs/")) {
    return repo.getReferenceCommit(revision);
  }

  if (COMMIT_HASH_PATTERN.test(revision)) {
    if (revision.length >= 40) {
      return repo.getCommit(revision);
    }

    return NodeGit.Commit.lookupPrefix(repo, revision, revision.length);
  }

  return NodeGit.Revparse.single(repo, `${revision}^{commit}`);
}

export async function createNodeGitClient({ projectRoot }) {
  let NodeGit;
  try {
    const nodeGitModule = await import("nodegit");
    NodeGit = nodeGitModule.default || nodeGitModule;
  } catch (error) {
    return createUnavailableBackendResult("nodegit", "the optional nodegit package is not installed or not loadable");
  }

  let repo;
  try {
    repo = await NodeGit.Repository.open(projectRoot);
  } catch (error) {
    return createUnavailableBackendResult("nodegit", error.message);
  }

  const client = {
    name: "nodegit",
    label: "NodeGit backend",

    async ensureCleanTrackedFiles() {
      const statusEntries = await repo.getStatusExt();
      const statusFlags = NodeGit.Status?.STATUS || {};
      const unstagedMask =
        (statusFlags.WT_MODIFIED || 0) |
        (statusFlags.WT_DELETED || 0) |
        (statusFlags.WT_TYPECHANGE || 0) |
        (statusFlags.WT_RENAMED || 0) |
        (statusFlags.CONFLICTED || 0);
      const stagedMask =
        (statusFlags.INDEX_NEW || 0) |
        (statusFlags.INDEX_MODIFIED || 0) |
        (statusFlags.INDEX_DELETED || 0) |
        (statusFlags.INDEX_TYPECHANGE || 0) |
        (statusFlags.INDEX_RENAMED || 0) |
        (statusFlags.CONFLICTED || 0);

      let hasUnstagedChanges = false;
      let hasStagedChanges = false;

      for (const entry of statusEntries) {
        const value = readStatusValue(entry);
        if ((value & unstagedMask) !== 0) {
          hasUnstagedChanges = true;
        }
        if ((value & stagedMask) !== 0) {
          hasStagedChanges = true;
        }
      }

      if (hasUnstagedChanges) {
        throw new Error("Update refused because tracked files have unstaged changes. Commit or stash them first.");
      }

      if (hasStagedChanges) {
        throw new Error("Update refused because tracked files have staged changes. Commit, unstage, or stash them first.");
      }
    },

    async fetchRemote(remoteName, authOptions = {}) {
      const remote = await repo.getRemote(remoteName);
      const remoteUrl = readNodeGitText(remote.url?.() || remote.url);
      await repo.fetch(remoteName, createFetchOptions(NodeGit, remoteUrl, authOptions));

      let defaultBranch = null;
      if (typeof remote.defaultBranch === "function") {
        try {
          defaultBranch = normalizeBranchName(readNodeGitText(await remote.defaultBranch()));
        } catch {
          defaultBranch = null;
        }
      }

      return { defaultBranch };
    },

    async readCurrentBranch() {
      if (repo.headDetached()) {
        return null;
      }

      const reference = await repo.getCurrentBranch();
      return readReferenceName(reference);
    },

    async hasLocalBranch(branchName) {
      try {
        await repo.getReference(`refs/heads/${branchName}`);
        return true;
      } catch {
        return false;
      }
    },

    async hasRemoteBranch(remoteName, branchName) {
      try {
        await repo.getReference(`refs/remotes/${remoteName}/${branchName}`);
        return true;
      } catch {
        return false;
      }
    },

    async readConfig(path) {
      const config = await repo.config();
      try {
        const value = await config.getStringBuf(path);
        return readNodeGitText(value)?.trim() || null;
      } catch {
        return null;
      }
    },

    async writeConfig(path, value) {
      const config = await repo.config();
      if (value === undefined) {
        config.deleteEntry(path);
        return;
      }

      await config.setString(path, String(value));
    },

    async readHeadCommit() {
      const commit = await repo.getHeadCommit();
      return oidToString(commit.id());
    },

    async readShortCommit(revision = "HEAD") {
      const commit = await resolveCommitObject(repo, NodeGit, revision);
      return shortenOid(oidToString(commit.id()));
    },

    async resolveTagRevision(tagName) {
      try {
        const object = await NodeGit.Revparse.single(repo, `refs/tags/${tagName}^{commit}`);
        return oidToString(object.id());
      } catch {
        return null;
      }
    },

    async resolveCommitRevision(target) {
      if (!COMMIT_HASH_PATTERN.test(target)) {
        return null;
      }

      try {
        const commit = await resolveCommitObject(repo, NodeGit, target);
        return oidToString(commit.id());
      } catch {
        return null;
      }
    },

    async checkoutBranch(remoteName, branchName) {
      try {
        await repo.checkoutBranch(branchName, checkoutOptions(NodeGit));
        return;
      } catch {
        const remoteRefName = `refs/remotes/${remoteName}/${branchName}`;
        const remoteCommit = await repo.getReferenceCommit(remoteRefName);
        await NodeGit.Branch.create(repo, branchName, remoteCommit, 0);

        const localReference = await repo.getBranch(branchName);
        if (typeof NodeGit.Branch?.setUpstream === "function") {
          await NodeGit.Branch.setUpstream(localReference, `${remoteName}/${branchName}`);
        }

        await repo.checkoutBranch(localReference, checkoutOptions(NodeGit));
      }
    },

    async fastForward(remoteName, branchName) {
      const localCommit = await repo.getReferenceCommit(`refs/heads/${branchName}`);
      const remoteCommit = await repo.getReferenceCommit(`refs/remotes/${remoteName}/${branchName}`);
      const canFastForward = await NodeGit.Graph.descendantOf(repo, remoteCommit.id(), localCommit.id());

      if (!canFastForward) {
        throw new Error(`Could not fast-forward ${branchName} to ${remoteName}/${branchName}.`);
      }

      await NodeGit.Reference.create(
        repo,
        `refs/heads/${branchName}`,
        remoteCommit.id(),
        1,
        `space update fast-forward ${branchName}`
      );

      await repo.checkoutBranch(branchName, checkoutOptions(NodeGit));
    },

    async hardReset(revision) {
      const commit = await resolveCommitObject(repo, NodeGit, revision);
      await NodeGit.Reset.reset(repo, commit, NodeGit.Reset.TYPE.HARD);
    },

    async checkoutDetached(revision) {
      const commit = await resolveCommitObject(repo, NodeGit, revision);
      repo.setHeadDetached(commit.id());
      await NodeGit.Checkout.tree(repo, commit, checkoutOptions(NodeGit));
    }
  };

  return createAvailableBackendResult("nodegit", client);
}

export async function createNodeGitCloneClient() {
  let NodeGit;
  try {
    const nodeGitModule = await import("nodegit");
    NodeGit = nodeGitModule.default || nodeGitModule;
  } catch {
    return createUnavailableBackendResult("nodegit", "the optional nodegit package is not installed or not loadable");
  }

  const client = {
    name: "nodegit",
    label: "NodeGit backend",

    async cloneRepository({ authOptions = {}, remoteUrl, targetDir }) {
      await NodeGit.Clone.clone(sanitizeRemoteUrl(remoteUrl), targetDir, {
        fetchOpts: createFetchOptions(NodeGit, remoteUrl, authOptions)
      });
    }
  };

  return createAvailableBackendResult("nodegit", client);
}
