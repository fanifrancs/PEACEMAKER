/**
 * Patch Applicator
 * Applies generated patches to files (Point 11)
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class PatchApplicator {
  constructor(gitOps) {
    this.gitOps = gitOps;
  }

  /**
   * Apply patches to files
   * @param {Object} patches - Generated patches
   * @param {Object} options - Application options
   * @returns {Object} Application results
   */
  async applyPatches(patches, options = {}) {
    const results = {
      applied: [],
      failed: [],
      skipped: [],
      metadata: {
        timestamp: new Date().toISOString(),
        totalPatches: 0,
        successCount: 0,
        failureCount: 0,
      },
    };

    // Count total patches
    results.metadata.totalPatches = 
      patches.conflicts.length + 
      patches.imports.length + 
      patches.dependencies.length;

    // Apply conflict patches
    for (const patch of patches.conflicts) {
      const result = await this.applyConflictPatch(patch, options);
      this.categorizeResult(result, results);
    }

    // Apply import patches
    for (const patch of patches.imports) {
      const result = await this.applyImportPatch(patch, options);
      this.categorizeResult(result, results);
    }

    // Apply dependency patches
    for (const patch of patches.dependencies) {
      const result = await this.applyDependencyPatch(patch, options);
      this.categorizeResult(result, results);
    }

    return results;
  }

  /**
   * Apply conflict resolution patch
   */
  async applyConflictPatch(patch, options) {
    const { file, patch: diffContent } = patch;

    try {
      // Read current file
      const currentContent = await this.gitOps.readFile(file);
      const lines = currentContent.split('\n');

      // Find and replace conflict markers
      const conflictMarkers = this.findConflictMarkers(lines);
      
      if (!conflictMarkers) {
        return {
          success: false,
          file,
          type: 'conflict-resolution',
          error: 'No conflict markers found',
        };
      }

      // Extract suggested code from patch
      const suggestedCode = this.extractSuggestedCode(diffContent);
      
      if (!suggestedCode) {
        return {
          success: false,
          file,
          type: 'conflict-resolution',
          error: 'Could not extract suggested code from patch',
        };
      }

      // Replace conflict section with suggested code
      const newLines = [
        ...lines.slice(0, conflictMarkers.start),
        ...suggestedCode.split('\n'),
        ...lines.slice(conflictMarkers.end + 1),
      ];

      const newContent = newLines.join('\n');

      // Write back to file
      if (!options.dryRun) {
        await fs.writeFile(file, newContent, 'utf8');
      }

      return {
        success: true,
        file,
        type: 'conflict-resolution',
        confidence: patch.confidence,
        approach: patch.approach,
        linesChanged: conflictMarkers.end - conflictMarkers.start + 1,
      };

    } catch (error) {
      return {
        success: false,
        file,
        type: 'conflict-resolution',
        error: error.message,
      };
    }
  }

  /**
   * Apply import fix patch
   */
  async applyImportPatch(patch, options) {
    const { file, metadata } = patch;

    try {
      // Read current file
      const currentContent = await this.gitOps.readFile(file);
      
      // Replace old import path with new one
      const newContent = currentContent.replace(
        new RegExp(this.escapeRegex(metadata.oldPath), 'g'),
        metadata.newPath
      );

      if (newContent === currentContent) {
        return {
          success: false,
          file,
          type: 'import-fix',
          error: 'Import path not found in file',
        };
      }

      // Write back to file
      if (!options.dryRun) {
        await fs.writeFile(file, newContent, 'utf8');
      }

      return {
        success: true,
        file,
        type: 'import-fix',
        confidence: patch.confidence,
        oldPath: metadata.oldPath,
        newPath: metadata.newPath,
      };

    } catch (error) {
      return {
        success: false,
        file,
        type: 'import-fix',
        error: error.message,
      };
    }
  }

  /**
   * Apply dependency update patch
   */
  async applyDependencyPatch(patch, options) {
    const { file, metadata } = patch;

    try {
      // Read package.json
      const content = await this.gitOps.readFile(file);
      const packageJson = JSON.parse(content);

      // Update version
      let updated = false;
      if (packageJson.dependencies && packageJson.dependencies[metadata.package]) {
        packageJson.dependencies[metadata.package] = metadata.newVersion;
        updated = true;
      }
      if (packageJson.devDependencies && packageJson.devDependencies[metadata.package]) {
        packageJson.devDependencies[metadata.package] = metadata.newVersion;
        updated = true;
      }

      if (!updated) {
        return {
          success: false,
          file,
          type: 'dependency-update',
          error: 'Package not found in dependencies',
        };
      }

      const newContent = JSON.stringify(packageJson, null, 2) + '\n';

      // Write back to file
      if (!options.dryRun) {
        await fs.writeFile(file, newContent, 'utf8');
      }

      return {
        success: true,
        file,
        type: 'dependency-update',
        confidence: patch.confidence,
        package: metadata.package,
        oldVersion: metadata.oldVersion,
        newVersion: metadata.newVersion,
      };

    } catch (error) {
      return {
        success: false,
        file,
        type: 'dependency-update',
        error: error.message,
      };
    }
  }

  /**
   * Apply patch using git apply command
   */
  async applyWithGitApply(patchFile, options = {}) {
    try {
      const cmd = `git apply ${options.check ? '--check' : ''} ${patchFile}`;
      execSync(cmd, { cwd: process.cwd(), stdio: 'pipe' });
      
      return {
        success: true,
        method: 'git-apply',
        patchFile,
      };
    } catch (error) {
      return {
        success: false,
        method: 'git-apply',
        patchFile,
        error: error.message,
      };
    }
  }

  /**
   * Find conflict markers in lines
   */
  findConflictMarkers(lines) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('<<<<<<<')) {
        let separator = -1;
        let end = -1;

        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('=======')) {
            separator = j;
          } else if (lines[j].startsWith('>>>>>>>')) {
            end = j;
            break;
          }
        }

        if (separator > 0 && end > 0) {
          return { start: i, separator, end };
        }
      }
    }

    return null;
  }

  /**
   * Extract suggested code from diff
   */
  extractSuggestedCode(diffContent) {
    const lines = diffContent.split('\n');
    const suggestedLines = [];
    let inAddedSection = false;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        suggestedLines.push(line.substring(1));
        inAddedSection = true;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Skip removed lines
        continue;
      } else if (inAddedSection && line.startsWith(' ')) {
        // Context line after added section
        break;
      }
    }

    return suggestedLines.join('\n');
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Categorize application result
   */
  categorizeResult(result, results) {
    if (result.success) {
      results.applied.push(result);
      results.metadata.successCount++;
    } else if (result.error) {
      results.failed.push(result);
      results.metadata.failureCount++;
    } else {
      results.skipped.push(result);
    }
  }

  /**
   * Generate commit message for applied patches
   */
  generateCommitMessage(results, guidance) {
    let message = 'chore: apply Peacemaker suggestions\n\n';

    // Summary
    message += `Applied ${results.metadata.successCount} of ${results.metadata.totalPatches} suggestions:\n`;
    
    const conflictCount = results.applied.filter(r => r.type === 'conflict-resolution').length;
    const importCount = results.applied.filter(r => r.type === 'import-fix').length;
    const depCount = results.applied.filter(r => r.type === 'dependency-update').length;

    if (conflictCount > 0) {
      message += `- ${conflictCount} conflict resolution(s)\n`;
    }
    if (importCount > 0) {
      message += `- ${importCount} import fix(es)\n`;
    }
    if (depCount > 0) {
      message += `- ${depCount} dependency update(s)\n`;
    }

    message += '\n';

    // Developer intent
    if (guidance?.intent) {
      message += `Intent: ${guidance.intent}\n\n`;
    }

    // Files changed
    const files = [...new Set(results.applied.map(r => r.file))];
    if (files.length > 0) {
      message += 'Files modified:\n';
      files.forEach(file => {
        message += `- ${file}\n`;
      });
    }

    message += '\nGenerated by Peacemaker AI-Assisted Merge Guidance\n';

    return message;
  }

  /**
   * Create git commit with applied patches
   */
  async createCommit(results, guidance, options = {}) {
    try {
      // Stage changed files
      const files = [...new Set(results.applied.map(r => r.file))];
      for (const file of files) {
        execSync(`git add ${file}`, { cwd: process.cwd() });
      }

      // Generate commit message
      const message = this.generateCommitMessage(results, guidance);

      // Create commit
      if (!options.dryRun) {
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { 
          cwd: process.cwd(),
          stdio: 'pipe'
        });
      }

      return {
        success: true,
        message,
        filesCommitted: files.length,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = PatchApplicator;

// Made with Bob
