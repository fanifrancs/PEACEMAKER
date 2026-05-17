const readline = require('readline');
const logger = require('../utils/logger');

/**
 * Intent Extractor - Gathers context from branch to understand developer intent
 * Combines PR info, commit messages, file changes, and optional developer input
 */
class IntentExtractor {
  constructor(gitOps) {
    this.gitOps = gitOps;
  }

  /**
   * Extract complete intent from a feature branch
   * @param {string} branch - Feature branch name
   * @param {Object} metrics - Branch divergence metrics
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Complete intent context
   */
  async extract(branch, metrics, options = {}) {
    logger.info('Extracting intent from branch...');

    try {
      // Gather all context sources
      const [prInfo, commits, fileChanges, developerInput] = await Promise.all([
        this._getPRInfo(branch, options),
        this._getCommitHistory(branch, metrics),
        this._getFileChanges(branch, metrics),
        options.developerInput ? Promise.resolve(options.developerInput) : (options.skipPrompt ? null : this._promptDeveloper())
      ]);

      const intent = {
        branch,
        baseBranch: fileChanges.baseBranch,
        forkPoint: fileChanges.forkPoint,
        prTitle: prInfo.title,
        prDescription: prInfo.description,
        commits,
        changedFiles: fileChanges.paths,
        featureChangedFiles: fileChanges.featurePaths || fileChanges.paths,
        mainChangedFiles: fileChanges.mainPaths || [],
        overlappingFiles: fileChanges.overlappingPaths || [],
        fileContents: fileChanges.contents,
        deletedFiles: fileChanges.deletedFiles || [],
        renamedFiles: fileChanges.renamedFiles || {},
        binaryFiles: fileChanges.binaryFiles || [],
        developerInput,
        metrics: {
          commitsBehind: metrics.commitsBehind,
          commitsAhead: metrics.commitsAhead,
          filesChanged: fileChanges.paths.length
        },
        timestamp: new Date().toISOString()
      };

      logger.debug('Intent extraction complete:', {
        commits: commits.length,
        files: fileChanges.paths.length,
        hasDeveloperInput: !!developerInput
      });

      return intent;

    } catch (error) {
      logger.error(`Intent extraction failed: ${error.message}`);
      throw new Error(`Failed to extract intent: ${error.message}`);
    }
  }

  /**
   * Get PR information (title and description)
   * @private
   */
  async _getPRInfo(branch, options) {
    // Try to get PR info from git branch description or commit messages
    try {
      // Check if there's a branch description
      const description = await this.gitOps.git.raw(['config', `branch.${branch}.description`]);
      
      if (description && description.trim()) {
        return {
          title: branch.replace(/^feature\/|^bugfix\/|^hotfix\//, '').replace(/-/g, ' '),
          description: description.trim()
        };
      }
    } catch (error) {
      // No branch description, that's okay
    }

    // Fallback: use branch name as title
    return {
      title: branch.replace(/^feature\/|^bugfix\/|^hotfix\//, '').replace(/-/g, ' '),
      description: options.prDescription || ''
    };
  }

  /**
   * Get commit history from the feature branch
   * @private
   */
  async _getCommitHistory(branch, metrics) {
    try {
      const defaultBranch = await this.gitOps.getDefaultBranch();
      const forkPoint = await this.gitOps.findForkPoint(branch, defaultBranch);

      // Get commits from fork point to branch head
      const log = await this.gitOps.git.log({
        from: forkPoint,
        to: branch
      });

      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        files: commit.diff?.files || []
      }));

    } catch (error) {
      logger.warn(`Could not get commit history: ${error.message}`);
      return [];
    }
  }

  /**
   * Get changed files and their contents
   * @private
   */
  async _getFileChanges(branch, metrics) {
    try {
      const defaultBranch = await this.gitOps.getDefaultBranch();
      const forkPoint = await this.gitOps.findForkPoint(branch, defaultBranch);

      // --name-status categorises every change: M=modified, A=added, D=deleted, R=renamed, C=copied
      const nameStatusText = await this.gitOps.git.raw(['diff', '--name-status', `${forkPoint}..${branch}`]);
      const deletedFiles = [];
      const renamedFiles = {};  // old path -> new path
      const allPaths = [];      // every path touched (for metrics / display)
      const featurePaths = [];  // paths that exist on the feature branch HEAD

      for (const line of nameStatusText.trim().split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        const statusChar = parts[0][0];
        if (statusChar === 'D') {
          deletedFiles.push(parts[1]);
          allPaths.push(parts[1]);
        } else if (statusChar === 'R' || statusChar === 'C') {
          renamedFiles[parts[1]] = parts[2];   // old -> new
          allPaths.push(parts[1], parts[2]);
          featurePaths.push(parts[2]);          // only the new path exists on the branch
        } else {
          allPaths.push(parts[1]);
          featurePaths.push(parts[1]);
        }
      }

      // --numstat prints "-  -  filename" for binary files — detect them before reading
      const numstatText = await this.gitOps.git.raw(['diff', '--numstat', `${forkPoint}..${branch}`]);
      const binaryFiles = [];
      for (const line of numstatText.trim().split('\n').filter(Boolean)) {
        if (line.startsWith('-\t-\t')) {
          binaryFiles.push(line.slice(4).trim());
        }
      }
      const binarySet = new Set(binaryFiles);

      // Compute main-side changes for overlap detection
      const mainChangedText = await this.gitOps.git.raw(['diff', '--name-only', `${forkPoint}..${defaultBranch}`]);
      const mainChangedPaths = mainChangedText.split('\n').map(f => f.trim()).filter(Boolean);
      const mainChangedSet = new Set(mainChangedPaths);
      const overlappingPaths = featurePaths.filter(file => mainChangedSet.has(file));

      // Read text content for non-binary feature-side files (cap at 20)
      const fileContents = {};
      const filesToRead = featurePaths.filter(f => !binarySet.has(f));
      for (const filePath of filesToRead) {
        try {
          const content = await this.gitOps.git.show([`${branch}:${filePath}`]);
          fileContents[filePath] = content;
        } catch (error) {
          logger.debug(`Could not read file ${filePath}: ${error.message}`);
        }
      }

      return {
        paths: allPaths,
        featurePaths,
        mainPaths: mainChangedPaths,
        overlappingPaths,
        baseBranch: defaultBranch,
        forkPoint,
        contents: fileContents,
        deletedFiles,
        renamedFiles,
        binaryFiles,
      };

    } catch (error) {
      logger.warn(`Could not get file changes: ${error.message}`);
      return { paths: [], featurePaths: [], contents: {}, deletedFiles: [], renamedFiles: {}, binaryFiles: [] };
    }
  }

  /**
   * Prompt developer for additional context (optional)
   * @private
   */
  async _promptDeveloper() {
    try {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => {
        rl.question('\n💬 What is this branch trying to do? (Press Enter to skip): ', ans => {
          rl.close();
          resolve(ans.trim());
        });
      });
      return answer || null;
    } catch (error) {
      logger.debug('Developer prompt skipped or failed');
      return null;
    }
  }

  /**
   * Build a summary of the intent for display
   * @param {Object} intent - Intent object
   * @returns {string} Human-readable summary
   */
  buildSummary(intent) {
    const parts = [];

    if (intent.prTitle) {
      parts.push(`PR: ${intent.prTitle}`);
    }

    if (intent.developerInput) {
      parts.push(`Developer: "${intent.developerInput}"`);
    }

    if (intent.commits.length > 0) {
      const commitMessages = intent.commits
        .map(c => c.message.split('\n')[0]) // First line only
        .slice(0, 3); // First 3 commits
      parts.push(`Commits: ${commitMessages.join('; ')}`);
      
      if (intent.commits.length > 3) {
        parts.push(`... and ${intent.commits.length - 3} more commits`);
      }
    }

    parts.push(`Files changed: ${intent.changedFiles.length}`);

    return parts.join('\n');
  }

  /**
   * Get relevant file contents for Bob context
   * @param {Object} intent - Intent object
   * @param {number} maxSize - Maximum total size in characters
   * @returns {Array} Array of {path, content} objects
   */
  getRelevantFiles(intent, maxSize = 50000) {
    const files = [];
    let totalSize = 0;

    for (const [path, content] of Object.entries(intent.fileContents)) {
      if (totalSize + content.length > maxSize) {
        // Truncate if we're approaching the limit
        const remaining = maxSize - totalSize;
        if (remaining > 1000) { // Only include if we have reasonable space
          files.push({
            path,
            content: content.substring(0, remaining) + '\n... (truncated)'
          });
        }
        break;
      }

      files.push({ path, content });
      totalSize += content.length;
    }

    return files;
  }
}

module.exports = IntentExtractor;

// Made with Bob