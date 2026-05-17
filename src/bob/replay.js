const BobClient = require('./client');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

/**
 * Intent Replay Engine - Orchestrates intent replay with intelligent retry
 * Handles the core Peacemaker workflow: replay intent, verify, retry if needed
 */
class IntentReplay {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.bobClient = new BobClient();
    this.maxRetries = 1; // Single retry as per PRD
  }

  /**
   * Replay intent with automatic retry on verification failure
   * @param {Object} intent - Extracted intent object
   * @param {string} freshBranch - Name of the fresh branch
   * @returns {Promise<Object>} Replay result with verification status
   */
  async replayWithRetry(intent, freshBranch, rawContext = null) {
    logger.info('Starting intent replay with retry capability...');

    let attempt = 1;
    let replayResult = null;
    let verification = null;
    let errorContext = null;

    // Attempt 1: Initial replay
    try {
      logger.info(`Attempt ${attempt}: Replaying intent...`);
      
      // Get fresh branch context
      const freshBranchContext = await this._getFreshBranchContext(freshBranch);

      // Inject feature branch file contents so Bob has the source of truth
      if (rawContext && rawContext.fileContents) {
        const featureFiles = Object.entries(rawContext.fileContents)
          .map(([filePath, fileContent]) => ({ path: filePath, content: fileContent }));
        freshBranchContext.relevantFiles = [
          ...featureFiles,
          ...(freshBranchContext.relevantFiles || [])
        ].slice(0, 15);
        freshBranchContext.featureBranch = rawContext.branch;
        freshBranchContext.changedFiles = rawContext.changedFiles || [];
      }
      
      // intent is already extracted — use it directly (no redundant Bob call)
      const extractedIntent = intent;

      // Replay intent onto fresh branch

      const seedFiles = await this._buildReplaySeedFiles(rawContext, extractedIntent);
      replayResult = await this.bobClient.replayIntent(
        extractedIntent,
        freshBranchContext,
        errorContext,
        seedFiles,
        { skipBobReplay: true, preservedFiles: rawContext._preservedFiles || [], seedDeletes: rawContext._seedDeletes || [], binaryFiles: rawContext._binaryFiles || [], featureBranch: rawContext.branch }
      );

      // Bob writes files directly — verify via fs.stat (exists + non-empty)
      const appliedFiles = replayResult?.changes || [];
      const issues1 = [];
      for (const change of appliedFiles) {
        if (change.operation !== 'delete') {
          try {
            const stat = await fs.stat(change.filePath);
            if (stat.size === 0) issues1.push({ file: change.filePath, description: `Written but empty: ${change.filePath}`, severity: 'error' });
            const content = await fs.readFile(change.filePath, 'utf8');
            if (this._hasConflictMarkers(content)) issues1.push({ file: change.filePath, description: `Conflict markers remain in file: ${change.filePath}`, severity: 'error' });
            const syntaxIssue = this._checkSyntax(change.filePath);
            if (syntaxIssue) issues1.push({ file: change.filePath, description: syntaxIssue, severity: 'error' });
          } catch {
            issues1.push({ file: change.filePath, description: `Not on disk: ${change.filePath}`, severity: 'error' });
          }
        }
      }
      // Cross-check: every file the feature branch changed must be present AND modified
      const before1 = replayResult?.before;
      for (const expected of (rawContext?.changedFiles || [])) {
        if (!appliedFiles.some(c => c.filePath === expected)) {
          try {
            const stat = await fs.stat(expected);
            // Pre-existing file: verify Bob actually modified it (mtime must differ from before snapshot)
            if (before1 && before1.has(expected) && before1.get(expected) === stat.mtimeMs) {
              issues1.push({ file: expected, description: `Pre-existing file not modified by Bob: ${expected}`, severity: 'error' });
            }
          } catch {
            issues1.push({ file: expected, description: `Expected from feature branch but missing: ${expected}`, severity: 'error' });
          }
        }
      }
      verification = {
        passed: issues1.length === 0,
        issues: issues1,
        warnings: [],
        confidence: 'high'
      };

      if (verification.passed) {
        logger.info('✓ Verification passed on first attempt');
        try {
          await this._stageReplayFiles(replayResult.changes);
          await this.gitOps.git.commit('Peacemaker: Applied intent replay changes');
          logger.info('Changes committed to branch');
        } catch (commitErr) {
          logger.warn(`Could not commit changes: ${commitErr.message}`);
        }
        return {
          success: true,
          attempt: 1,
          retryNeeded: false,
          extractedIntent,
          replayResult,
          verification,
          appliedChanges: replayResult.changes
        };
      }

      // Verification failed (missing files), prepare for retry
      logger.warn('⚠ Verification failed on first attempt, analyzing errors...');
      errorContext = { rootCause: 'Files not written to disk', fixStrategy: 'Retry replay', issues: verification.issues };

    } catch (error) {
      logger.error(`Attempt 1 failed: ${error.message}`);
      return {
        success: false,
        attempt: 1,
        retryNeeded: false,
        error: error.message,
        verification: { passed: false, issues: [{ description: error.message }] }
      };
    }

    // Attempt 2: Retry with error context
    attempt = 2;
    try {
      logger.info(`Attempt ${attempt}: Retrying with error context...`);
      logger.debug('Error context:', errorContext);

      // Get fresh context again, re-enriched with feature branch files
      const freshBranchContext = await this._getFreshBranchContext(freshBranch);
      if (rawContext && rawContext.fileContents) {
        const featureFiles = Object.entries(rawContext.fileContents)
          .map(([path, content]) => ({ path, content }));
        freshBranchContext.relevantFiles = [
          ...featureFiles,
          ...(freshBranchContext.relevantFiles || [])
        ].slice(0, 15);
        freshBranchContext.featureBranch = rawContext.branch;
        freshBranchContext.changedFiles = rawContext.changedFiles || [];
      }

      // Reuse the already-extracted intent (cache hit if re-run)
      const extractedIntent = intent;

      // Replay with error context

      const seedFiles = await this._buildReplaySeedFiles(rawContext, extractedIntent);
      replayResult = await this.bobClient.replayIntent(
        extractedIntent,
        freshBranchContext,
        errorContext,
        seedFiles,
        { skipBobReplay: true, preservedFiles: rawContext._preservedFiles || [], seedDeletes: rawContext._seedDeletes || [], binaryFiles: rawContext._binaryFiles || [], featureBranch: rawContext.branch }
      );

      // Bob writes files directly — verify via fs.stat (exists + non-empty)
      const appliedFiles2 = replayResult?.changes || [];
      const issues2 = [];
      for (const change of appliedFiles2) {
        if (change.operation !== 'delete') {
          try {
            const stat = await fs.stat(change.filePath);
            if (stat.size === 0) issues2.push({ file: change.filePath, description: `Written but empty: ${change.filePath}`, severity: 'error' });
            const content = await fs.readFile(change.filePath, 'utf8');
            if (this._hasConflictMarkers(content)) issues2.push({ file: change.filePath, description: `Conflict markers remain in file: ${change.filePath}`, severity: 'error' });
            const syntaxIssue = this._checkSyntax(change.filePath);
            if (syntaxIssue) issues2.push({ file: change.filePath, description: syntaxIssue, severity: 'error' });
          } catch {
            issues2.push({ file: change.filePath, description: `Not on disk: ${change.filePath}`, severity: 'error' });
          }
        }
      }
      const before2 = replayResult?.before;
      for (const expected of (rawContext?.changedFiles || [])) {
        if (!appliedFiles2.some(c => c.filePath === expected)) {
          try {
            const stat = await fs.stat(expected);
            if (before2 && before2.has(expected) && before2.get(expected) === stat.mtimeMs) {
              issues2.push({ file: expected, description: `Pre-existing file not modified by Bob: ${expected}`, severity: 'error' });
            }
          } catch {
            issues2.push({ file: expected, description: `Expected from feature branch but missing: ${expected}`, severity: 'error' });
          }
        }
      }
      verification = {
        passed: issues2.length === 0,
        issues: issues2,
        warnings: [],
        confidence: 'high'
      };

      if (verification.passed) {
        logger.info('✓ Verification passed on retry attempt');
        try {
          await this._stageReplayFiles(replayResult.changes);
          await this.gitOps.git.commit('Peacemaker: Applied intent replay changes (retry)');
          logger.info('Changes committed to branch');
        } catch (commitErr) {
          logger.warn(`Could not commit changes: ${commitErr.message}`);
        }
      } else {
        logger.warn('⚠ Verification still has issues after retry');
      }

      return {
        success: verification.passed,
        attempt: 2,
        retryNeeded: true,
        extractedIntent,
        replayResult,
        verification,
        errorContext,
        appliedChanges: replayResult.changes
      };

    } catch (error) {
      logger.error(`Attempt 2 failed: ${error.message}`);
      return {
        success: false,
        attempt: 2,
        retryNeeded: true,
        error: error.message,
        errorContext,
        verification: verification || { passed: false, issues: [{ description: error.message }] }
      };
    }
  }

  async _buildReplaySeedFiles(rawContext, intent) {
    const seedFiles = {};
    const seedDeletes = [];

    if (!rawContext || !rawContext.fileContents || !rawContext.changedFiles) {
      return seedFiles;
    }

    const overlappingFiles = new Set(rawContext.overlappingFiles || []);
    const deletedFiles = new Set(rawContext.deletedFiles || []);
    const renamedFiles = rawContext.renamedFiles || {};   // old path -> new path
    const binaryFiles = new Set(rawContext.binaryFiles || []);

    // 1. Deletions — mark for removal on the replay branch
    for (const filePath of deletedFiles) {
      seedDeletes.push(filePath);
      logger.info(`[Seed] Marking for deletion: ${filePath}`);
    }

    // 2. Renames — delete old path, copy new content
    for (const [oldPath, newPath] of Object.entries(renamedFiles)) {
      seedDeletes.push(oldPath);
      const newContent = rawContext.fileContents[newPath];
      if (newContent !== undefined) {
        seedFiles[newPath] = newContent;
      }
      logger.info(`[Seed] Rename: ${oldPath} -> ${newPath}`);
    }

    const renamedOldPaths = new Set(Object.keys(renamedFiles));
    const renamedNewPaths = new Set(Object.values(renamedFiles));

    // 3. Binary files — copy via git show into a temp buffer then write bytes
    for (const filePath of binaryFiles) {
      if (renamedOldPaths.has(filePath) || deletedFiles.has(filePath)) continue;
      logger.info(`[Seed] Binary file (will copy from feature branch): ${filePath}`);
      rawContext._binaryFiles = rawContext._binaryFiles || [];
      rawContext._binaryFiles.push(filePath);
    }

    // 4. Text files (added / modified)
    for (const filePath of rawContext.changedFiles) {
      if (deletedFiles.has(filePath)) continue;
      if (renamedOldPaths.has(filePath) || renamedNewPaths.has(filePath)) continue;
      if (binaryFiles.has(filePath)) continue;

      const featureContent = rawContext.fileContents[filePath];
      if (featureContent === undefined) continue;

      if (!overlappingFiles.has(filePath)) {
        seedFiles[filePath] = featureContent;
        continue;
      }

      const mergedContent = await this._mergeOverlappingFile(filePath, featureContent, rawContext, intent);
      if (mergedContent !== null) {
        seedFiles[filePath] = mergedContent;
      }
    }

    if (Object.keys(seedFiles).length > 0) {
      logger.info(`[Seed] Will write directly: ${Object.keys(seedFiles).join(', ')}`);
    }
    if (seedDeletes.length > 0) {
      logger.info(`[Seed] Will delete: ${seedDeletes.join(', ')}`);
    }

    // Preserve files that main added after the fork point but the feature branch never touched.
    if (rawContext.forkPoint) {
      try {
        const forkFiles = (await this.gitOps.git.raw(['diff', '--name-only', rawContext.forkPoint, 'main'])).trim().split('\n').filter(Boolean);
        const featureFileSet = new Set(rawContext.changedFiles || []);
        const mainOnlyFiles = forkFiles.filter(f => !featureFileSet.has(f));
        for (const filePath of mainOnlyFiles) {
          if (seedFiles[filePath] !== undefined) continue;
          try {
            const content = await fs.readFile(filePath, 'utf8');
            seedFiles[filePath] = content;
            rawContext._preservedFiles = rawContext._preservedFiles || [];
            rawContext._preservedFiles.push(filePath);
            logger.info(`[Seed] Preserving main-only file: ${filePath}`);
          } catch {
            // File may have been deleted on main intentionally — skip
          }
        }
      } catch (err) {
        logger.warn(`[Seed] Could not compute main-only files: ${err.message}`);
      }
    }

    // Attach delete list so replayIntent can act on it
    rawContext._seedDeletes = seedDeletes;

    return seedFiles;
  }

  async _mergeOverlappingFile(filePath, featureContent, rawContext, intent) {
    if (!rawContext.forkPoint) {
      logger.warn(`[Merge] No fork point for ${filePath} — using feature branch version directly`);
      return featureContent;
    }

    let baseContent;
    let mainContent;

    try {
      baseContent = await this.gitOps.git.show([`${rawContext.forkPoint}:${filePath}`]);
      mainContent = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      logger.warn(`[Merge] Could not load versions for ${filePath}: ${error.message}`);
      return null;
    }

    try {
      const merged = await this._mergeFileContentsWithGit(filePath, baseContent, mainContent, featureContent);
      logger.info(`[Merge] Clean 3-way merge produced: ${filePath}`);
      return merged;
    } catch (mergeError) {
      logger.warn(`[Merge] Git could not cleanly merge ${filePath}; asking Bob for one-file resolution`);
      try {
        const merged = await this.bobClient.mergeFileDirectly({
          filePath,
          baseContent,
          mainContent,
          featureContent,
          intent
        });
        logger.info(`[Merge] Bob wrote one-file merge directly to disk: ${filePath}`);
        return merged;
      } catch (bobError) {
        logger.warn(`[Merge] Bob could not merge ${filePath}: ${bobError.message}`);
        return null;
      }
    }
  }

  async _mergeFileContentsWithGit(filePath, baseContent, mainContent, featureContent) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peacemaker-merge-'));
    const safeName = filePath.replace(/[\\/]/g, '__');

    const basePath = path.join(tmpDir, `${safeName}.base`);
    const mainPath = path.join(tmpDir, `${safeName}.main`);
    const featurePath = path.join(tmpDir, `${safeName}.feature`);

    await fs.writeFile(basePath, baseContent, 'utf8');
    await fs.writeFile(mainPath, mainContent, 'utf8');
    await fs.writeFile(featurePath, featureContent, 'utf8');

    try {
      const merged = await this.gitOps.git.raw(['merge-file', '-p', mainPath, basePath, featurePath]);
      if (this._hasConflictMarkers(merged)) {
        throw new Error(`git merge-file produced conflict markers for ${filePath}`);
      }
      return merged.endsWith('\n') ? merged : merged + '\n';
    } finally {
      try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  _checkSyntax(filePath) {
    const path = require('path');
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
        execSync(`node --check ${JSON.stringify(filePath)}`, { stdio: 'pipe' });

      } else if (ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
        return null; // tsc intercepted by Bob Shell — skip, rely on existence + non-empty checks

      } else if (ext === '.py') {
        execSync(`python3 -m py_compile ${JSON.stringify(filePath)}`, { stdio: 'pipe' });

      } else if (ext === '.go') {
        execSync(`go vet ${JSON.stringify(filePath)}`, { stdio: 'pipe' });

      } else if (ext === '.rs') {
        execSync(`rustc --edition 2021 --crate-type lib ${JSON.stringify(filePath)} --out-dir /tmp`, { stdio: 'pipe' });

      } else {
        return null;
      }
      return null;
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`.trim();
      return `Syntax check failed for ${filePath}: ${output.split('\n')[0] || error.message}`;
    }
  }

  _hasConflictMarkers(content) {
    return /(^|\n)<<<<<<<[ \t]/.test(content) ||
      /(^|\n)=======$/.test(content) ||
      /(^|\n)>>>>>>>[ \t]/.test(content);
  }

  async _stageReplayFiles(changes = []) {
    const files = [...new Set(
      changes
        .map(change => change && change.filePath)
        .filter(Boolean)
    )];

    if (files.length === 0) {
      throw new Error('No verified replay files to stage');
    }

    await this.gitOps.git.add(files);
    logger.info(`[Stage] Staged verified replay files: ${files.join(', ')}`);
  }

  /**
   * Get context of the fresh branch for Bob
   * @private
   */
  async _getFreshBranchContext(branch) {
    try {
      // Get current branch files
      const files = await this._getRelevantFiles(branch);
      
      // Get package.json for dependencies
      let dependencies = null;
      try {
        const packageJson = await fs.readFile('package.json', 'utf-8');
        const pkg = JSON.parse(packageJson);
        dependencies = {
          dependencies: pkg.dependencies || {},
          devDependencies: pkg.devDependencies || {}
        };
      } catch (error) {
        logger.debug('No package.json found or could not read it');
      }

      // Get project structure
      const structure = await this._getProjectStructure();

      return {
        branch,
        relevantFiles: files,
        dependencies,
        structure
      };

    } catch (error) {
      logger.warn(`Could not get full branch context: ${error.message}`);
      return { branch, relevantFiles: [], dependencies: null, structure: null };
    }
  }

  /**
   * Get relevant files from the current branch
   * @private
   */
  async _getRelevantFiles(branch, maxFiles = 10) {
    const files = [];
    
    try {
      // Get list of files in common directories
      const commonDirs = ['src', 'lib', 'app', 'components', 'utils'];
      
      for (const dir of commonDirs) {
        try {
          const dirFiles = await this._readDirectoryRecursive(dir, maxFiles - files.length);
          files.push(...dirFiles);
          
          if (files.length >= maxFiles) break;
        } catch (error) {
          // Directory doesn't exist, skip it
        }
      }

    } catch (error) {
      logger.debug(`Could not read files: ${error.message}`);
    }

    return files;
  }

  /**
   * Read directory recursively
   * @private
   */
  async _readDirectoryRecursive(dir, maxFiles = 10) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip node_modules, .git, etc.
          if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            const subFiles = await this._readDirectoryRecursive(fullPath, maxFiles - files.length);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          // Only include code files
          if (this._isCodeFile(entry.name)) {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              files.push({ path: fullPath, content });
            } catch (error) {
              // Skip files we can't read
            }
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }

    return files;
  }

  /**
   * Check if file is a code file
   * @private
   */
  _isCodeFile(filename) {
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h'];
    return codeExtensions.some(ext => filename.endsWith(ext));
  }

  /**
   * Get project structure overview
   * @private
   */
  async _getProjectStructure() {
    try {
      const structure = {
        directories: [],
        fileCount: 0
      };

      const entries = await fs.readdir('.', { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          structure.directories.push(entry.name);
        }
      }

      return structure;

    } catch (error) {
      return null;
    }
  }

  /**
   * Apply changes to the file system
   * @private
   */
  async _applyChanges(changes, branch) {
    logger.info(`Applying ${changes.length} changes to branch ${branch}...`);

    for (const change of changes) {
      try {
        const { filePath, operation, content } = change;

        switch (operation) {
          case 'create':
          case 'modify':
            // Ensure directory exists
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            
            // Write file
            await fs.writeFile(filePath, content, 'utf-8');
            logger.debug(`${operation === 'create' ? 'Created' : 'Modified'}: ${filePath}`);
            break;

          case 'delete':
            try {
              await fs.unlink(filePath);
              logger.debug(`Deleted: ${filePath}`);
            } catch (error) {
              // File might not exist, that's okay
              logger.debug(`Could not delete ${filePath}: ${error.message}`);
            }
            break;

          default:
            logger.warn(`Unknown operation: ${operation} for ${filePath}`);
        }

      } catch (error) {
        logger.error(`Failed to apply change to ${change.filePath}: ${error.message}`);
        throw error;
      }
    }

    // Stage only files touched by this replay operation.
    try {
      const filesToStage = [...new Set(
        changes
          .map(change => change && change.filePath)
          .filter(Boolean)
      )];

      if (filesToStage.length === 0) {
        throw new Error('No replay files to stage');
      }

      await this.gitOps.git.add(filesToStage);
      logger.info(`[Stage] Staged replay files: ${filesToStage.join(', ')}`);
      await this.gitOps.git.commit(`Peacemaker: Applied intent replay changes`);
      logger.info('Changes committed to branch');
    } catch (error) {
      logger.warn(`Could not commit changes: ${error.message}`);
    }
  }

  /**
   * Build a summary of the replay result for display
   * @param {Object} result - Replay result
   * @returns {string} Human-readable summary
   */
  buildSummary(result) {
    const lines = [];

    lines.push(`Attempt: ${result.attempt}`);
    lines.push(`Retry Needed: ${result.retryNeeded ? 'Yes' : 'No'}`);
    lines.push(`Success: ${result.success ? '✓' : '✗'}`);

    if (result.extractedIntent) {
      lines.push(`\nIntent: ${result.extractedIntent.summary}`);
      lines.push(`Confidence: ${result.extractedIntent.confidence}`);
    }

    if (result.appliedChanges) {
      lines.push(`\nChanges Applied: ${result.appliedChanges.length} files`);
      result.appliedChanges.forEach(change => {
        lines.push(`  - ${change.operation}: ${change.filePath}`);
      });
    }

    if (result.verification) {
      lines.push(`\nVerification: ${result.verification.passed ? 'PASSED' : 'FAILED'}`);
      if (result.verification.issues && result.verification.issues.length > 0) {
        lines.push(`Issues Found: ${result.verification.issues.length}`);
        result.verification.issues.slice(0, 3).forEach(issue => {
          lines.push(`  - ${issue.file}: ${issue.description}`);
        });
      }
    }

    if (result.errorContext) {
      lines.push(`\nError Analysis:`);
      lines.push(`  Root Cause: ${result.errorContext.rootCause}`);
      lines.push(`  Fix Strategy: ${result.errorContext.fixStrategy}`);
    }

    return lines.join('\n');
  }
}

module.exports = IntentReplay;

// Made with Bob