import simpleGit from 'simple-git';
import { execSync } from 'child_process';
import logger from '../utils/logger.js';

const git = simpleGit();

export async function getBranchDivergence(featureBranch, baseBranch) {
  try {
    const ahead = execSync(`git rev-list --count ${baseBranch}..${featureBranch}`, { encoding: 'utf8' }).trim();
    const behind = execSync(`git rev-list --count ${featureBranch}..${baseBranch}`, { encoding: 'utf8' }).trim();
    
    return {
      behind: parseInt(behind, 10),
      ahead: parseInt(ahead, 10),
      featureBranch,
      baseBranch,
    };
  } catch (error) {
    logger.error(`Failed to get branch divergence: ${error.message}`);
    throw error;
  }
}

export async function findForkPoint(featureBranch, baseBranch) {
  try {
    const forkPoint = execSync(`git merge-base ${baseBranch} ${featureBranch}`, { encoding: 'utf8' }).trim();
    return forkPoint || null;
  } catch (error) {
    logger.debug(`No fork point found between ${baseBranch} and ${featureBranch}`);
    return null;
  }
}

export async function getChangedFiles(featureBranch, baseBranch) {
  try {
    const forkPoint = await findForkPoint(featureBranch, baseBranch);
    
    let files;
    if (forkPoint) {
      files = execSync(`git diff --name-only ${forkPoint}..${featureBranch}`, { encoding: 'utf8' });
    } else {
      // Fall back to tip-to-tip diff
      logger.debug('No fork point - using tip-to-tip diff for changed files');
      files = execSync(`git diff --name-only ${baseBranch}..${featureBranch}`, { encoding: 'utf8' });
    }
    
    return files.trim().split('\n').filter(f => f);
  } catch (error) {
    logger.error(`Failed to get changed files: ${error.message}`);
    throw error;
  }
}

export async function getConflictingFiles(featureBranch, baseBranch) {
  try {
    const forkPoint = await findForkPoint(featureBranch, baseBranch);
    
    if (!forkPoint) {
      logger.debug('No fork point - cannot determine conflicting files');
      return [];
    }
    
    const featureFiles = execSync(`git diff --name-only ${forkPoint} ${featureBranch}`, { encoding: 'utf8' })
      .trim().split('\n').filter(f => f);
    const baseFiles = execSync(`git diff --name-only ${forkPoint} ${baseBranch}`, { encoding: 'utf8' })
      .trim().split('\n').filter(f => f);
    
    // Return intersection
    return featureFiles.filter(f => baseFiles.includes(f));
  } catch (error) {
    logger.error(`Failed to get conflicting files: ${error.message}`);
    throw error;
  }
}

export async function createBranchFromLatest(branchName, baseBranch) {
  try {
    await git.checkout(baseBranch);
    
    // Try to pull, but don't fail if it's a local-only repo
    try {
      await git.pull('origin', baseBranch);
    } catch (pullError) {
      logger.debug(`Could not pull ${baseBranch} from origin (local-only repo?): ${pullError.message}`);
    }
    
    await git.checkoutLocalBranch(branchName);
    logger.info(`Created fresh branch: ${branchName}`);
  } catch (error) {
    logger.error(`Failed to create branch ${branchName}: ${error.message}`);
    throw error;
  }
}

export async function mergeBranch(replayBranch, baseBranch, featureBranch) {
  try {
    await git.checkout(baseBranch);
    await git.merge([replayBranch, '--no-ff', '-m', `Merge ${featureBranch} via Peacemakr`]);
    logger.info(`Merged ${replayBranch} into ${baseBranch}`);
  } catch (error) {
    logger.error(`Failed to merge ${replayBranch} into ${baseBranch}: ${error.message}`);
    throw error;
  }
}

export async function getFileContent(branch, filePath) {
  try {
    const content = execSync(`git show ${branch}:${filePath}`, { encoding: 'utf8' });
    return content;
  } catch (error) {
    logger.debug(`File ${filePath} does not exist on branch ${branch}`);
    return null;
  }
}

export async function getFileContentBuffer(branch, filePath) {
  try {
    const content = execSync(`git show ${branch}:${filePath}`, { encoding: null });
    return content;
  } catch (error) {
    logger.debug(`File ${filePath} does not exist on branch ${branch}`);
    return null;
  }
}

export async function getCommitHistory(branch, baseBranch, limit = 50) {
  try {
    const forkPoint = await findForkPoint(branch, baseBranch);
    const range = forkPoint ? `${forkPoint}..${branch}` : branch;
    
    const log = await git.log([range, `--max-count=${limit}`]);
    
    return log.all.map(commit => ({
      hash: commit.hash.substring(0, 7),
      message: commit.message,
      author: commit.author_name,
      date: commit.date,
    }));
  } catch (error) {
    logger.error(`Failed to get commit history: ${error.message}`);
    throw error;
  }
}

export async function createTag(tagName, ref = 'HEAD') {
  try {
    await git.addTag(tagName, ref);
    logger.info(`Created tag: ${tagName}`);
  } catch (error) {
    logger.error(`Failed to create tag ${tagName}: ${error.message}`);
    throw error;
  }
}

export async function stageFiles(files) {
  try {
    await git.add(files);
    logger.debug(`Staged ${files.length} file(s)`);
  } catch (error) {
    logger.error(`Failed to stage files: ${error.message}`);
    throw error;
  }
}

export async function commitChanges(message) {
  try {
    await git.commit(message);
    logger.info(`Committed: ${message}`);
  } catch (error) {
    logger.error(`Failed to commit: ${error.message}`);
    throw error;
  }
}

export async function checkoutBranch(branchName) {
  try {
    await git.checkout(branchName);
    logger.debug(`Checked out branch: ${branchName}`);
  } catch (error) {
    logger.error(`Failed to checkout ${branchName}: ${error.message}`);
    throw error;
  }
}

export async function deleteBranch(branchName, force = true) {
  try {
    await git.deleteLocalBranch(branchName, force);
    logger.info(`Deleted branch: ${branchName}`);
  } catch (error) {
    logger.error(`Failed to delete branch ${branchName}: ${error.message}`);
    throw error;
  }
}

export async function getCurrentBranch() {
  try {
    const status = await git.status();
    return status.current;
  } catch (error) {
    logger.error(`Failed to get current branch: ${error.message}`);
    throw error;
  }
}

export async function getLocalBranches() {
  try {
    const branches = await git.branchLocal();
    return branches.all;
  } catch (error) {
    logger.error(`Failed to get local branches: ${error.message}`);
    throw error;
  }
}

export async function getRecentCommit(branch) {
  try {
    const log = await git.log([branch, '--max-count=1']);
    const commit = log.latest;
    
    if (!commit) return null;
    
    const now = new Date();
    const commitDate = new Date(commit.date);
    const diffMs = now - commitDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    let timeAgo;
    if (diffDays > 0) {
      timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
      timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMins > 0) {
      timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else {
      timeAgo = '1 second ago';
    }
    
    return {
      hash: commit.hash.substring(0, 7),
      message: commit.message,
      timeAgo,
    };
  } catch (error) {
    logger.error(`Failed to get recent commit: ${error.message}`);
    throw error;
  }
}

export async function getFilesInBranch(branch) {
  try {
    const files = execSync(`git ls-tree -r --name-only ${branch}`, { encoding: 'utf8' });
    return files.trim().split('\n').filter(f => f);
  } catch (error) {
    logger.error(`Failed to get files in branch ${branch}: ${error.message}`);
    throw error;
  }
}

// Made with Bob
