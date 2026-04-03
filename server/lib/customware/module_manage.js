import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

import { cloneGitRepository, createGitClient } from "../git/client_create.js";
import { sanitizeRemoteUrl } from "../git/shared.js";
import { createAppAccessController, createHttpError, toAppRelativePath } from "./file_access.js";
import { normalizeMaxLayer } from "./layer_limit.js";
import {
  normalizeAppProjectPath,
  parseModuleDirectoryRequestPath,
  parseProjectModuleDirectoryPath
} from "./layout.js";
import { collectAccessibleModuleEntries, createEmptyGroupIndex } from "./overrides.js";

const DEFAULT_REMOTE = "origin";
const DEFAULT_REMOTE_FETCH = "+refs/heads/*:refs/remotes/origin/*";

function stripTrailingSlash(value) {
  const text = String(value || "");
  return text.endsWith("/") ? text.slice(0, -1) : text;
}

function getGroupIndex(watchdog) {
  if (!watchdog || typeof watchdog.getIndex !== "function") {
    return createEmptyGroupIndex();
  }

  return watchdog.getIndex("group_index") || createEmptyGroupIndex();
}

function getPathIndex(watchdog) {
  if (!watchdog || typeof watchdog.getIndex !== "function") {
    return Object.create(null);
  }

  return watchdog.getIndex("path_index") || Object.create(null);
}

function hasPath(pathIndex, projectPath) {
  return Boolean(pathIndex && projectPath && pathIndex[projectPath]);
}

function hasDescendantPath(pathIndex, projectPath) {
  const normalizedPath = String(projectPath || "");

  return Object.keys(pathIndex).some(
    (candidatePath) => candidatePath !== normalizedPath && candidatePath.startsWith(normalizedPath)
  );
}

function createAbsolutePath(projectRoot, projectPath) {
  return path.join(String(projectRoot || ""), stripTrailingSlash(String(projectPath || "").slice(1)));
}

function createModulePathError(value) {
  return createHttpError(
    `Expected a module root path under L1/<group>/mod/<author>/<repo>/ or L2/<user>/mod/<author>/<repo>/: ${String(value || "")}`,
    400
  );
}

function normalizeModuleTargetPath(inputPath, options = {}) {
  const normalizedProjectPath = normalizeAppProjectPath(inputPath, {
    isDirectory: true
  });
  const modulePathInfo = parseProjectModuleDirectoryPath(normalizedProjectPath);

  if (!normalizedProjectPath || !modulePathInfo) {
    throw createModulePathError(inputPath);
  }

  const accessController = createAppAccessController({
    groupIndex: getGroupIndex(options.watchdog),
    username: options.username
  });

  if (!accessController.canWriteProjectPath(normalizedProjectPath)) {
    throw createHttpError("Write access denied.", 403);
  }

  return {
    ...modulePathInfo,
    absolutePath: createAbsolutePath(options.projectRoot, normalizedProjectPath),
    appPath: toAppRelativePath(normalizedProjectPath),
    projectPath: normalizedProjectPath
  };
}

function normalizeModuleReference(inputPath) {
  const requestPathInfo = parseModuleDirectoryRequestPath(inputPath);

  if (requestPathInfo) {
    return requestPathInfo;
  }

  const normalizedProjectPath = normalizeAppProjectPath(inputPath, {
    isDirectory: true
  });
  const modulePathInfo = parseProjectModuleDirectoryPath(normalizedProjectPath);

  if (!normalizedProjectPath || !modulePathInfo) {
    throw createModulePathError(inputPath);
  }

  return modulePathInfo;
}

async function readModuleGitInfo(options = {}) {
  const absolutePath = String(options.absolutePath || "");

  if (!absolutePath || !fs.existsSync(path.join(absolutePath, ".git"))) {
    return null;
  }

  try {
    const gitClient = await createGitClient({
      projectRoot: absolutePath
    });
    const [currentBranch, remoteUrl, headCommit, shortCommit] = await Promise.all([
      gitClient.readCurrentBranch(),
      gitClient.readConfig(`remote.${DEFAULT_REMOTE}.url`),
      gitClient.readHeadCommit(),
      gitClient.readShortCommit()
    ]);

    return {
      backend: gitClient.name,
      detached: !currentBranch,
      headCommit,
      remoteUrl: remoteUrl ? sanitizeRemoteUrl(remoteUrl) : null,
      shortCommit,
      branch: currentBranch
    };
  } catch (error) {
    return {
      error: error.message || "Failed to read Git repository info."
    };
  }
}

async function ensureRemoteConfig(gitClient, repoUrl) {
  const configuredRemoteUrl = repoUrl
    ? sanitizeRemoteUrl(repoUrl)
    : await gitClient.readConfig(`remote.${DEFAULT_REMOTE}.url`);

  if (!configuredRemoteUrl) {
    throw createHttpError("Module install requires a repository URL.", 400);
  }

  await gitClient.writeConfig(`remote.${DEFAULT_REMOTE}.url`, configuredRemoteUrl);

  const currentFetchSpec = await gitClient.readConfig(`remote.${DEFAULT_REMOTE}.fetch`);
  if (!currentFetchSpec) {
    await gitClient.writeConfig(`remote.${DEFAULT_REMOTE}.fetch`, DEFAULT_REMOTE_FETCH);
  }

  return configuredRemoteUrl;
}

async function updateTrackedBranch(gitClient, defaultBranch) {
  let branchName = await gitClient.readCurrentBranch();

  if (!branchName) {
    branchName = defaultBranch;
  }

  if (!branchName) {
    throw createHttpError(
      "Module update could not determine a branch to attach or fast-forward.",
      400
    );
  }

  if (!(await gitClient.hasRemoteBranch(DEFAULT_REMOTE, branchName))) {
    if (defaultBranch && branchName !== defaultBranch && (await gitClient.hasRemoteBranch(DEFAULT_REMOTE, defaultBranch))) {
      branchName = defaultBranch;
    } else {
      throw createHttpError(`Remote ${DEFAULT_REMOTE} does not have branch ${branchName}.`, 400);
    }
  }

  await gitClient.checkoutBranch(DEFAULT_REMOTE, branchName);
  await gitClient.fastForward(DEFAULT_REMOTE, branchName);

  return branchName;
}

async function checkoutRequestedRevision(gitClient, options = {}) {
  if (options.tag) {
    const revision = await gitClient.resolveTagRevision(options.tag);

    if (!revision) {
      throw createHttpError(`Could not resolve tag ${options.tag}.`, 400);
    }

    await gitClient.checkoutDetached(revision);
    return {
      kind: "tag",
      value: options.tag
    };
  }

  if (options.commit) {
    const revision = await gitClient.resolveCommitRevision(options.commit, DEFAULT_REMOTE, {
      remoteUrl: options.remoteUrl,
      token: options.token
    });

    if (!revision) {
      throw createHttpError(`Could not resolve commit ${options.commit}.`, 400);
    }

    await gitClient.checkoutDetached(revision);
    return {
      kind: "commit",
      value: options.commit
    };
  }

  return null;
}

async function installIntoNewPath(targetPathInfo, options = {}) {
  const ownerRootProjectPath = `/app/${targetPathInfo.layer}/${targetPathInfo.ownerId}`;
  const ownerRootAbsolutePath = createAbsolutePath(options.projectRoot, ownerRootProjectPath);

  await fsPromises.mkdir(ownerRootAbsolutePath, { recursive: true });
  const tempAbsolutePath = await fsPromises.mkdtemp(path.join(ownerRootAbsolutePath, ".module_install_"));

  try {
    await cloneGitRepository({
      authOptions: {
        token: options.token
      },
      remoteUrl: options.repoUrl,
      targetDir: tempAbsolutePath
    });

    if (options.tag || options.commit) {
      const gitClient = await createGitClient({
        projectRoot: tempAbsolutePath
      });
      const remoteUrl = await ensureRemoteConfig(gitClient, options.repoUrl);

      await gitClient.fetchRemote(DEFAULT_REMOTE, {
        remoteUrl,
        token: options.token
      });
      await checkoutRequestedRevision(gitClient, {
        commit: options.commit,
        remoteUrl,
        tag: options.tag,
        token: options.token
      });
    }

    await fsPromises.mkdir(path.dirname(targetPathInfo.absolutePath), { recursive: true });
    await fsPromises.rename(tempAbsolutePath, targetPathInfo.absolutePath);
  } catch (error) {
    await fsPromises.rm(tempAbsolutePath, {
      force: true,
      recursive: true
    });
    throw error;
  }
}

async function updateExistingPath(targetPathInfo, options = {}) {
  let gitClient;

  try {
    gitClient = await createGitClient({
      projectRoot: targetPathInfo.absolutePath
    });
  } catch (error) {
    throw createHttpError(
      error.message || `Module path is not a valid Git repository: ${targetPathInfo.appPath}`,
      400
    );
  }

  await gitClient.ensureCleanTrackedFiles();

  const remoteUrl = await ensureRemoteConfig(gitClient, options.repoUrl);
  const { defaultBranch } = await gitClient.fetchRemote(DEFAULT_REMOTE, {
    remoteUrl,
    token: options.token
  });
  const checkedOutTarget = await checkoutRequestedRevision(gitClient, {
    commit: options.commit,
    remoteUrl,
    tag: options.tag,
    token: options.token
  });

  if (!checkedOutTarget) {
    await updateTrackedBranch(gitClient, defaultBranch);
  }
}

async function resolveInstalledLocations(options = {}) {
  if (!options.watchdog || typeof options.watchdog.getPaths !== "function") {
    return [];
  }

  const entries = collectAccessibleModuleEntries(options.watchdog.getPaths(), {
    groupIndex: getGroupIndex(options.watchdog),
    maxLayer: normalizeMaxLayer(options.maxLayer),
    parseProjectPath: parseProjectModuleDirectoryPath,
    username: options.username
  }).filter((entry) => entry.requestPath === options.requestPath);

  return Promise.all(
    entries.map(async (entry, index) => ({
      authorId: entry.authorId,
      git: await readModuleGitInfo({
        absolutePath: createAbsolutePath(options.projectRoot, entry.projectPath)
      }),
      layer: entry.layer,
      ownerId: entry.ownerId,
      ownerType: entry.ownerType,
      path: toAppRelativePath(entry.projectPath),
      rank: entry.rank,
      requestPath: entry.requestPath,
      repositoryId: entry.repositoryId,
      selected: index === entries.length - 1
    }))
  );
}

async function readModuleInfo(options = {}) {
  const moduleReference = normalizeModuleReference(options.path || options.modulePath || options.requestPath || "");
  const locations = await resolveInstalledLocations({
    maxLayer: options.maxLayer,
    projectRoot: options.projectRoot,
    requestPath: moduleReference.requestPath,
    username: options.username,
    watchdog: options.watchdog
  });
  const selectedLocation = locations.find((location) => location.selected) || null;

  return {
    installed: locations.length > 0,
    locations,
    modulePath: moduleReference.requestPath.slice(1),
    requestPath: moduleReference.requestPath,
    selectedPath: selectedLocation ? selectedLocation.path : ""
  };
}

async function installModule(options = {}) {
  if (options.tag && options.commit) {
    throw createHttpError("Specify either tag or commit, not both.", 400);
  }

  const targetPathInfo = normalizeModuleTargetPath(options.path, options);
  const pathIndex = getPathIndex(options.watchdog);
  const conflictingFilePath = stripTrailingSlash(targetPathInfo.projectPath);
  const existsAsDirectory =
    hasPath(pathIndex, targetPathInfo.projectPath) || hasDescendantPath(pathIndex, targetPathInfo.projectPath);

  if (hasPath(pathIndex, conflictingFilePath)) {
    throw createHttpError(`Module path already exists as a file: ${targetPathInfo.appPath}`, 400);
  }

  if (!existsAsDirectory && !options.repoUrl) {
    throw createHttpError("Module install requires a repository URL.", 400);
  }

  try {
    if (existsAsDirectory) {
      await updateExistingPath(targetPathInfo, options);
    } else {
      await installIntoNewPath(targetPathInfo, options);
    }
  } catch (error) {
    if (error && error.statusCode) {
      throw error;
    }

    throw createHttpError(error.message || "Module install failed.", 400);
  }

  return {
    action: existsAsDirectory ? "updated" : "installed",
    path: targetPathInfo.appPath,
    requestPath: targetPathInfo.requestPath
  };
}

async function listInstalledModules(options = {}) {
  if (!options.watchdog || typeof options.watchdog.getPaths !== "function") {
    return [];
  }

  // Always use maxLayer 2 so L1 and L2 modules are visible regardless of the
  // request context (admin requests run with maxLayer=0 for resolution, but the
  // intent here is to list what is actually installed).
  const entries = collectAccessibleModuleEntries(options.watchdog.getPaths(), {
    groupIndex: getGroupIndex(options.watchdog),
    maxLayer: 2,
    parseProjectPath: parseProjectModuleDirectoryPath,
    username: options.username
  }).filter((entry) => entry.layer !== "L0");

  return Promise.all(
    entries.map(async (entry) => ({
      authorId: entry.authorId,
      git: await readModuleGitInfo({
        absolutePath: createAbsolutePath(options.projectRoot, entry.projectPath)
      }),
      layer: entry.layer,
      ownerId: entry.ownerId,
      ownerType: entry.ownerType,
      path: toAppRelativePath(entry.projectPath),
      requestPath: entry.requestPath,
      repositoryId: entry.repositoryId
    }))
  );
}

export {
  installModule,
  listInstalledModules,
  normalizeModuleTargetPath,
  readModuleInfo
};
