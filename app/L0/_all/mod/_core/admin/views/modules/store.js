const moduleListModel = {
  modules: [],
  loaded: false,
  loading: false,
  error: null,

  async load() {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      const result = await space.api.call("module_list");

      this.modules = Array.isArray(result) ? result : [];
      this.loaded = true;
    } catch (err) {
      this.error = err.message || "Failed to load modules.";
    } finally {
      this.loading = false;
    }
  },

  async refresh() {
    this.loaded = false;
    this.modules = [];
    await this.load();
  },

  formatGitSummary(git) {
    if (!git) {
      return "no git";
    }

    if (git.error) {
      return `git error: ${git.error}`;
    }

    const ref = git.branch || (git.shortCommit ? `detached @ ${git.shortCommit}` : "unknown ref");
    return git.shortCommit ? `${ref} (${git.shortCommit})` : ref;
  },

  formatRemoteUrl(git) {
    if (!git || !git.remoteUrl) {
      return null;
    }

    return git.remoteUrl;
  },

  formatOwner(mod) {
    return mod.ownerType === "user" ? mod.ownerId : `${mod.ownerId} (group)`;
  }
};

const adminModules = space.fw.createStore("adminModules", moduleListModel);

export { adminModules };
