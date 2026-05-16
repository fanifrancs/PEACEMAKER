/**
 * Patch Generator
 * Generates patches from approved AI suggestions (Point 11)
 */

const fs = require('fs').promises;
const path = require('path');

class PatchGenerator {
  constructor(gitOps) {
    this.gitOps = gitOps;
  }

  /**
   * Generate patches from approved suggestions
   * @param {Array} approvedSuggestions - List of approved suggestions
   * @param {Object} options - Generation options
   * @returns {Object} Generated patches
   */
  async generatePatches(approvedSuggestions, options = {}) {
    const patches = {
      conflicts: [],
      imports: [],
      dependencies: [],
      metadata: {
        timestamp: new Date().toISOString(),
        totalSuggestions: approvedSuggestions.length,
        generatedPatches: 0,
      },
    };

    for (const suggestion of approvedSuggestions) {
      try {
        let patch = null;

        switch (suggestion.type) {
          case 'conflict-resolution':
            patch = await this.generateConflictPatch(suggestion);
            if (patch) patches.conflicts.push(patch);
            break;

          case 'import-fix':
            patch = await this.generateImportPatch(suggestion);
            if (patch) patches.imports.push(patch);
            break;

          case 'dependency-update':
            patch = await this.generateDependencyPatch(suggestion);
            if (patch) patches.dependencies.push(patch);
            break;

          default:
            console.warn(`Unknown suggestion type: ${suggestion.type}`);
        }

        if (patch) {
          patches.metadata.generatedPatches++;
        }
      } catch (error) {
        console.error(`Failed to generate patch for ${suggestion.file}:`, error.message);
      }
    }

    return patches;
  }

  /**
   * Generate patch for conflict resolution
   */
  async generateConflictPatch(suggestion) {
    const { file, resolution } = suggestion;

    if (!resolution || !resolution.suggestedCode) {
      return null;
    }

    // Read current file content
    const currentContent = await this.gitOps.readFile(file);
    const lines = currentContent.split('\n');

    // Find conflict markers
    const conflictStart = this.findConflictMarkers(lines);
    
    if (!conflictStart) {
      console.warn(`No conflict markers found in ${file}`);
      return null;
    }

    // Generate unified diff format patch
    const patch = {
      file,
      type: 'conflict-resolution',
      confidence: resolution.confidence,
      approach: resolution.approach,
      patch: this.createUnifiedDiff(
        file,
        lines,
        conflictStart,
        resolution.suggestedCode
      ),
      metadata: {
        conflictType: suggestion.conflictType,
        reasoning: resolution.reasoning,
      },
    };

    return patch;
  }

  /**
   * Generate patch for import fix
   */
  async generateImportPatch(suggestion) {
    const { file, oldPath, newPath, line } = suggestion;

    // Read current file content
    const currentContent = await this.gitOps.readFile(file);
    const lines = currentContent.split('\n');

    if (line && line > 0 && line <= lines.length) {
      const oldLine = lines[line - 1];
      const newLine = oldLine.replace(oldPath, newPath);

      const patch = {
        file,
        type: 'import-fix',
        confidence: suggestion.confidence,
        patch: this.createSimpleDiff(file, line, oldLine, newLine),
        metadata: {
          oldPath,
          newPath,
          importType: suggestion.importType || 'unknown',
        },
      };

      return patch;
    }

    return null;
  }

  /**
   * Generate patch for dependency update
   */
  async generateDependencyPatch(suggestion) {
    const { file, package: pkg, sourceVersion, targetVersion, suggestion: suggestedVersion } = suggestion;

    // Read package.json
    const content = await this.gitOps.readFile(file);
    const packageJson = JSON.parse(content);

    // Update version
    let updated = false;
    if (packageJson.dependencies && packageJson.dependencies[pkg]) {
      packageJson.dependencies[pkg] = suggestedVersion;
      updated = true;
    }
    if (packageJson.devDependencies && packageJson.devDependencies[pkg]) {
      packageJson.devDependencies[pkg] = suggestedVersion;
      updated = true;
    }

    if (!updated) {
      return null;
    }

    const newContent = JSON.stringify(packageJson, null, 2) + '\n';

    const patch = {
      file,
      type: 'dependency-update',
      confidence: suggestion.confidence,
      patch: this.createFileDiff(file, content, newContent),
      metadata: {
        package: pkg,
        oldVersion: sourceVersion || targetVersion,
        newVersion: suggestedVersion,
        reasoning: suggestion.reasoning,
      },
    };

    return patch;
  }

  /**
   * Find conflict markers in file
   */
  findConflictMarkers(lines) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('<<<<<<<')) {
        // Find corresponding markers
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
   * Create unified diff format
   */
  createUnifiedDiff(file, lines, conflictMarkers, suggestedCode) {
    const { start, end } = conflictMarkers;
    
    const beforeContext = lines.slice(Math.max(0, start - 3), start);
    const afterContext = lines.slice(end + 1, Math.min(lines.length, end + 4));

    let diff = `--- a/${file}\n`;
    diff += `+++ b/${file}\n`;
    diff += `@@ -${start + 1},${end - start + 1} +${start + 1},${suggestedCode.split('\n').length} @@\n`;

    // Context before
    beforeContext.forEach(line => {
      diff += ` ${line}\n`;
    });

    // Removed lines (conflict markers and content)
    for (let i = start; i <= end; i++) {
      diff += `-${lines[i]}\n`;
    }

    // Added lines (suggested code)
    suggestedCode.split('\n').forEach(line => {
      diff += `+${line}\n`;
    });

    // Context after
    afterContext.forEach(line => {
      diff += ` ${line}\n`;
    });

    return diff;
  }

  /**
   * Create simple line replacement diff
   */
  createSimpleDiff(file, lineNumber, oldLine, newLine) {
    let diff = `--- a/${file}\n`;
    diff += `+++ b/${file}\n`;
    diff += `@@ -${lineNumber},1 +${lineNumber},1 @@\n`;
    diff += `-${oldLine}\n`;
    diff += `+${newLine}\n`;
    return diff;
  }

  /**
   * Create full file diff
   */
  createFileDiff(file, oldContent, newContent) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let diff = `--- a/${file}\n`;
    diff += `+++ b/${file}\n`;
    diff += `@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;

    // Simple line-by-line diff
    const maxLines = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (i < oldLines.length && i < newLines.length) {
        if (oldLines[i] !== newLines[i]) {
          diff += `-${oldLines[i]}\n`;
          diff += `+${newLines[i]}\n`;
        } else {
          diff += ` ${oldLines[i]}\n`;
        }
      } else if (i < oldLines.length) {
        diff += `-${oldLines[i]}\n`;
      } else {
        diff += `+${newLines[i]}\n`;
      }
    }

    return diff;
  }

  /**
   * Save patches to file
   */
  async savePatchesToFile(patches, outputPath) {
    const patchContent = this.formatPatchesForFile(patches);
    await fs.writeFile(outputPath, patchContent, 'utf8');
    return outputPath;
  }

  /**
   * Format patches for file output
   */
  formatPatchesForFile(patches) {
    let content = '# PEACEMAKER Generated Patches\n';
    content += `# Generated: ${patches.metadata.timestamp}\n`;
    content += `# Total Suggestions: ${patches.metadata.totalSuggestions}\n`;
    content += `# Generated Patches: ${patches.metadata.generatedPatches}\n\n`;

    // Conflict patches
    if (patches.conflicts.length > 0) {
      content += '## Conflict Resolution Patches\n\n';
      patches.conflicts.forEach((patch, index) => {
        content += `### Patch ${index + 1}: ${patch.file}\n`;
        content += `Confidence: ${(patch.confidence * 100).toFixed(0)}%\n`;
        content += `Approach: ${patch.approach}\n`;
        content += `Reasoning: ${patch.metadata.reasoning}\n\n`;
        content += '```diff\n';
        content += patch.patch;
        content += '```\n\n';
      });
    }

    // Import patches
    if (patches.imports.length > 0) {
      content += '## Import Fix Patches\n\n';
      patches.imports.forEach((patch, index) => {
        content += `### Patch ${index + 1}: ${patch.file}\n`;
        content += `Old: ${patch.metadata.oldPath}\n`;
        content += `New: ${patch.metadata.newPath}\n`;
        content += `Confidence: ${(patch.confidence * 100).toFixed(0)}%\n\n`;
        content += '```diff\n';
        content += patch.patch;
        content += '```\n\n';
      });
    }

    // Dependency patches
    if (patches.dependencies.length > 0) {
      content += '## Dependency Update Patches\n\n';
      patches.dependencies.forEach((patch, index) => {
        content += `### Patch ${index + 1}: ${patch.file}\n`;
        content += `Package: ${patch.metadata.package}\n`;
        content += `Old Version: ${patch.metadata.oldVersion}\n`;
        content += `New Version: ${patch.metadata.newVersion}\n`;
        content += `Confidence: ${(patch.confidence * 100).toFixed(0)}%\n\n`;
        content += '```diff\n';
        content += patch.patch;
        content += '```\n\n';
      });
    }

    return content;
  }
}

module.exports = PatchGenerator;

// Made with Bob
