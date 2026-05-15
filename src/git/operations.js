/**
 * Git Operations Wrapper
 * Provides high-level Git operations for merge analysis
 */

const simpleGit = require('simple-git');
const logger = require('../utils/logger');

class GitOperations {
  constructor(workingDir = process.cwd()) {
    this.git = simpleGit(workingDir);
    this.workingDir = workingDir;
  }

  /**
   * Check if current directory is a git repository
   */
  async isGitRepository() {
    try {
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch() {
    try {
      const status = await this.git.status();
      return status.current;
    } catch (error) {
      logger.error('Failed to get current branch:', error.message);
      throw error;
    }
  }

  /**
   * Check if a branch exists
   */
  async branchExists(branchName) {
    try {
      const branches = await this.git.branch();
      return branches.all.includes(branchName) || branches.all.includes(`remotes/origin/${branchName}`);
    } catch (error) {
      logger.error(`Failed to check if branch ${branchName} exists:`, error.message);
      throw error;
    }
  }

  /**
   * Detect fork point (merge-base) between two branches
   * This is Point 6 in the workflow
   */
  async detectForkPoint(sourceBranch, targetBranch) {
    try {
      logger.debug(`Detecting fork point between ${sourceBranch} and ${targetBranch}`);
      
      const mergeBase = await this.git.raw(['merge-base', targetBranch, sourceBranch]);
      const forkPoint = mergeBase.trim();
      
      // Get commit details
      const commitInfo = await this.git.show([forkPoint, '--format=%H|%ai|%s', '--no-patch']);
      const [hash, date, subject] = commitInfo.trim().split('|');
      
      // Calculate days since fork
      const forkDate = new Date(date);
      const now = new Date();
      const daysSinceFork = Math.floor((now - forkDate) / (1000 * 60 * 60 * 24));
      
      return {
        hash: forkPoint,
        date: forkDate,
        daysSinceFork,
        subject: subject || 'Unknown commit',
      };
    } catch (error) {
      logger.error('Failed to detect fork point:', error.message);
      throw new Error(`Could not find fork point between ${sourceBranch} and ${targetBranch}`);
    }
  }

  /**
   * Calculate divergence between two branches
   * Returns commits ahead and behind
   */
  async calculateDivergence(sourceBranch, targetBranch) {
    try {
      logger.debug(`Calculating divergence between ${sourceBranch} and ${targetBranch}`);
      
      // Get commits ahead (in source but not in target)
      const aheadResult = await this.git.raw([
        'rev-list',
        '--count',
        `${targetBranch}..${sourceBranch}`,
      ]);
      const commitsAhead = parseInt(aheadResult.trim(), 10);
      
      // Get commits behind (in target but not in source)
      const behindResult = await this.git.raw([
        'rev-list',
        '--count',
        `${sourceBranch}..${targetBranch}`,
      ]);
      const commitsBehind = parseInt(behindResult.trim(), 10);
      
      return {
        commitsAhead,
        commitsBehind,
        totalDivergence: commitsAhead + commitsBehind,
      };
    } catch (error) {
      logger.error('Failed to calculate divergence:', error.message);
      throw error;
    }
  }

  /**
   * Get list of changed files between two branches
   */
  async getChangedFiles(sourceBranch, targetBranch) {
    try {
      logger.debug(`Getting changed files between ${sourceBranch} and ${targetBranch}`);
      
      // Files changed in source branch
      const sourceFiles = await this.git.raw([
        'diff',
        '--name-only',
        `${targetBranch}...${sourceBranch}`,
      ]);
      
      // Files changed in target branch
      const targetFiles = await this.git.raw([
        'diff',
        '--name-only',
        `${sourceBranch}...${targetBranch}`,
      ]);
      
      const sourceFileList = sourceFiles.trim().split('\n').filter(Boolean);
      const targetFileList = targetFiles.trim().split('\n').filter(Boolean);
      
      // Find overlapping files (changed in both branches)
      const overlappingFiles = sourceFileList.filter((file) => targetFileList.includes(file));
      
      return {
        sourceFiles: sourceFileList,
        targetFiles: targetFileList,
        overlappingFiles,
        totalFiles: new Set([...sourceFileList, ...targetFileList]).size,
      };
    } catch (error) {
      logger.error('Failed to get changed files:', error.message);
      throw error;
    }
  }

  /**
   * Simulate merge to detect conflicts
   * This is Point 7 in the workflow
   */
  async simulateMerge(sourceBranch, targetBranch) {
    try {
      logger.debug(`Simulating merge of ${sourceBranch} into ${targetBranch}`);
      
      // Save current branch
      const currentBranch = await this.getCurrentBranch();
      
      // Create a temporary branch for simulation
      const tempBranch = `peacemaker-temp-${Date.now()}`;
      
      try {
        // Checkout target branch
        await this.git.checkout(targetBranch);
        
        // Create temp branch
        await this.git.checkoutBranch(tempBranch, targetBranch);
        
        // Try to merge
        try {
          await this.git.merge([sourceBranch, '--no-commit', '--no-ff']);
          
          // Check for conflicts
          const status = await this.git.status();
          const hasConflicts = status.conflicted.length > 0;
          
          // Abort the merge
          await this.git.raw(['merge', '--abort']);
          
          return {
            success: !hasConflicts,
            conflicts: status.conflicted,
            modified: status.modified,
            created: status.created,
            deleted: status.deleted,
          };
        } catch (mergeError) {
          // Merge failed - get conflict info
          const status = await this.git.status();
          
          // Abort the merge
          try {
            await this.git.raw(['merge', '--abort']);
          } catch (abortError) {
            logger.warn('Failed to abort merge:', abortError.message);
          }
          
          return {
            success: false,
            conflicts: status.conflicted,
            modified: status.modified,
            created: status.created,
            deleted: status.deleted,
            error: mergeError.message,
          };
        }
      } finally {
        // Cleanup: return to original branch and delete temp branch
        try {
          await this.git.checkout(currentBranch);
          await this.git.deleteLocalBranch(tempBranch, true);
        } catch (cleanupError) {
          logger.warn('Failed to cleanup temp branch:', cleanupError.message);
        }
      }
    } catch (error) {
      logger.error('Failed to simulate merge:', error.message);
      throw error;
    }
  }

  /**
   * Get file content at specific commit/branch
   */
  async getFileContent(filePath, ref = 'HEAD') {
    try {
      const content = await this.git.show([`${ref}:${filePath}`]);
      return content;
    } catch (error) {
      logger.debug(`Failed to get content for ${filePath} at ${ref}:`, error.message);
      return null;
    }
  }

  /**
   * Get commit history for a branch
   */
  async getCommitHistory(branch, limit = 10) {
    try {
      const log = await this.git.log({
        from: branch,
        maxCount: limit,
      });
      
      return log.all.map((commit) => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
      }));
    } catch (error) {
      logger.error('Failed to get commit history:', error.message);
      throw error;
    }
  }

  /**
   * Get diff between two branches
   */
  async getDiff(sourceBranch, targetBranch, filePath = null) {
    try {
      const args = ['diff', `${targetBranch}...${sourceBranch}`];
      if (filePath) {
        args.push('--', filePath);
      }
      
      const diff = await this.git.raw(args);
      return diff;
    } catch (error) {
      logger.error('Failed to get diff:', error.message);
      throw error;
    }
  }
}

module.exports = GitOperations;

// Made with Bob
