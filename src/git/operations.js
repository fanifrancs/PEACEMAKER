const simpleGit = require('simple-git');
const logger = require('../utils/logger');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const readFile = promisify(fs.readFile);

class GitOperations {
  constructor() {
    this.git = simpleGit();
  }

  /**
   * Detects the default branch of the repository
   * @returns {Promise<string>} Name of the default branch
   */
  async getDefaultBranch() {
    try {
      // Method 1: Check git config
      let defaultBranch;
      try {
        defaultBranch = await this.git.raw(['config', '--get', 'init.defaultBranch']);
        if (defaultBranch) return defaultBranch.trim();
      } catch (configError) {
        // Ignore config error and try other methods
      }

      // Method 2: Check remote tracking branches
      const remoteBranches = await this.git.branch(['-r']);
      const mainCandidates = ['main', 'master', 'trunk', 'develop', 'development'];

      for (const candidate of mainCandidates) {
        if (remoteBranches.all.includes(`origin/${candidate}`)) {
          return candidate;
        }
      }

      // Method 3: Fallback to current branch
      const branches = await this.git.branch();
      return branches.current;

    } catch (error) {
      throw new Error(`Could not determine default branch: ${error.message}`);
    }
  }

  /**
   * Finds the fork point between two branches
   * @param {string} featureBranch - The feature branch name
   * @param {string} baseBranch - The base branch name (defaults to main)
   * @returns {Promise<string>} The commit hash of the fork point
   */
  async findForkPoint(featureBranch, baseBranch = null) {
    if (!baseBranch) {
      baseBranch = await this.getDefaultBranch();
    }

    try {
      const mergeBase = await this.git.raw([
        'merge-base',
        featureBranch,
        baseBranch
      ]);
      return mergeBase.trim();
    } catch (error) {
      throw new Error(`Could not find fork point: ${error.message}`);
    }
  }

  /**
   * Gets the number of commits a branch is behind the base branch
   * @param {string} featureBranch - The feature branch name
   * @param {string} baseBranch - The base branch name
   * @returns {Promise<number>} Number of commits behind
   */
  async getCommitsBehind(featureBranch, baseBranch) {
    try {
      // commits in baseBranch not in featureBranch = how far behind feature is
      const result = await this.git.raw(['rev-list', '--count', `${featureBranch}..${baseBranch}`]);
      return parseInt(result.trim(), 10);
    } catch (error) {
      throw new Error(`Could not get commits behind: ${error.message}`);
    }
  }

  /**
   * Gets the number of commits a branch is ahead of the base branch
   * @param {string} featureBranch - The feature branch name
   * @param {string} baseBranch - The base branch name
   * @returns {Promise<number>} Number of commits ahead
   */
  async getCommitsAhead(featureBranch, baseBranch) {
    try {
      // commits in featureBranch not in baseBranch = how far ahead feature is
      const result = await this.git.raw(['rev-list', '--count', `${baseBranch}..${featureBranch}`]);
      return parseInt(result.trim(), 10);
    } catch (error) {
      throw new Error(`Could not get commits ahead: ${error.message}`);
    }
  }

  /**
   * Creates a new branch from the latest base branch
   * @param {string} newBranchName - Name for the new branch
   * @param {string} baseBranch - Base branch name (defaults to main)
   * @returns {Promise<void>}
   */
  async createBranchFromLatest(newBranchName, baseBranch = null) {
    if (!baseBranch) {
      baseBranch = await this.getDefaultBranch();
    }

    try {
      // Try to pull from remote — skip silently if branch is local-only
      try {
        await this.git.pull('origin', baseBranch);
      } catch (pullErr) {
        logger.debug(`Could not pull ${baseBranch} from origin (may be local-only): ${pullErr.message}`);
      }

      // Use origin/<base> if remote exists, otherwise fall back to local <base>
      const remoteBranches = await this.git.branch(['-r']);
      const remoteRef = `origin/${baseBranch}`;
      const startPoint = remoteBranches.all.includes(remoteRef) ? remoteRef : baseBranch;
      logger.debug(`Creating ${newBranchName} from ${startPoint}`);
      await this.git.checkoutBranch(newBranchName, startPoint);
    } catch (error) {
      throw new Error(`Could not create branch: ${error.message}`);
    }
  }

  /**
   * Gets changed files between two branches
   * @param {string} featureBranch - The feature branch name
   * @param {string} baseBranch - The base branch name
   * @returns {Promise<Array>} Array of changed file paths
   */
  async getChangedFiles(featureBranch, baseBranch) {
    try {
      const forkPoint = await this.findForkPoint(featureBranch, baseBranch);
      // If no fork point, fall back to tip-to-tip diff so changedFilesCount reflects true scope
      const range = forkPoint ? `${forkPoint}..${featureBranch}` : `${baseBranch}..${featureBranch}`;
      if (!forkPoint) logger.debug(`No fork point for getChangedFiles — using tip-to-tip diff: ${range}`);
      const diff = await this.git.raw(['diff', '--name-only', range]);
      return diff
        .split('\n')
        .map(file => file.trim())
        .filter(Boolean);
    } catch (error) {
      throw new Error(`Could not get changed files: ${error.message}`);
    }
  }

  /**
   * Gets conflicting files between two branches
   * @param {string} featureBranch - The feature branch name
   * @param {string} baseBranch - The base branch name
   * @returns {Promise<Array>} Array of conflicting file paths
   */
  async getConflictingFiles(featureBranch, baseBranch) {
    const tempBranch = `peacemaker-temp-${Date.now()}`;
    try {
      // Check if branches share a common ancestor first
      let hasCommonAncestor = true;
      try {
        await this.git.raw(['merge-base', featureBranch, baseBranch]);
      } catch (_) {
        hasCommonAncestor = false;
      }

      // If no common ancestor, conflict detection via merge is unreliable — skip it
      if (!hasCommonAncestor) {
        logger.warn(`Branches have no common ancestor — skipping conflict detection, assuming none`);
        return [];
      }

      await this.git.checkoutBranch(tempBranch, baseBranch);

      try {
        await this.git.merge([featureBranch, '--no-commit', '--no-ff']);
      } catch (mergeErr) {
        // Merge error = real conflicts exist, capture them
        const status = await this.git.status();
        const conflicts = status.conflicted || [];
        try { await this.git.merge(['--abort']); } catch (_) {}
        await this.git.checkout(baseBranch);
        await this.git.branch(['-D', tempBranch]);
        return conflicts;
      }

      // Clean merge — no conflicts
      const status = await this.git.status();
      const conflicts = status.conflicted || [];
      try { await this.git.reset(['--hard', 'HEAD']); } catch (_) {}
      await this.git.checkout(baseBranch);
      await this.git.branch(['-D', tempBranch]);
      return conflicts;

    } catch (error) {
      try {
        await this.git.checkout(baseBranch);
        await this.git.branch(['-D', tempBranch]);
      } catch (_) {}
      logger.warn(`Could not detect conflicts (${error.message}) — assuming none`);
      return [];
    }
  }
}

module.exports = GitOperations;

// Made with Bob
