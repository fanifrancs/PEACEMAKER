/**
 * Structural Adjustment Advisor (Point 8.4)
 * Guides architectural changes spanning multiple files
 */

const IBMBobClient = require('./ibm-bob-client');
const logger = require('../utils/logger');

class StructuralAdvisor {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.bobClient = new IBMBobClient();
  }

  /**
   * Analyze structural changes between branches
   */
  async analyzeStructuralChanges(sourceBranch, targetBranch, changedFiles) {
    logger.debug('Analyzing structural changes...');

    const changes = [];

    // Detect function signature changes
    const signatureChanges = await this.detectSignatureChanges(
      sourceBranch,
      targetBranch,
      changedFiles,
    );
    changes.push(...signatureChanges);

    // Detect class/interface renames
    const renameChanges = await this.detectRenames(
      sourceBranch,
      targetBranch,
      changedFiles,
    );
    changes.push(...renameChanges);

    // Detect API endpoint changes
    const apiChanges = await this.detectAPIChanges(
      sourceBranch,
      targetBranch,
      changedFiles,
    );
    changes.push(...apiChanges);

    return {
      total: changes.length,
      changes,
      summary: this.generateSummary(changes),
    };
  }

  /**
   * Detect function signature changes
   */
  async detectSignatureChanges(sourceBranch, targetBranch, changedFiles) {
    const changes = [];

    for (const file of changedFiles.overlappingFiles) {
      try {
        const sourceContent = await this.gitOps.getFileContent(file, sourceBranch);
        const targetContent = await this.gitOps.getFileContent(file, targetBranch);

        if (!sourceContent || !targetContent) continue;

        const sourceFunctions = this.extractFunctions(sourceContent, file);
        const targetFunctions = this.extractFunctions(targetContent, file);

        // Find changed signatures
        for (const sourceFunc of sourceFunctions) {
          const targetFunc = targetFunctions.find((f) => f.name === sourceFunc.name);
          
          if (targetFunc && sourceFunc.signature !== targetFunc.signature) {
            // Find call sites
            const callSites = await this.findCallSites(sourceFunc.name, changedFiles.sourceFiles);

            changes.push({
              type: 'signature-change',
              file,
              function: sourceFunc.name,
              oldSignature: sourceFunc.signature,
              newSignature: targetFunc.signature,
              callSites,
              needsUpdate: callSites.length > 0,
            });
          }
        }
      } catch (error) {
        logger.debug(`Failed to analyze ${file}:`, error.message);
      }
    }

    return changes;
  }

  /**
   * Extract function definitions from code
   */
  extractFunctions(content, file) {
    const functions = [];
    const ext = file.split('.').pop();

    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      // JavaScript/TypeScript functions
      const funcRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>))\s*\(([^)]*)\)/g;
      let match;

      while ((match = funcRegex.exec(content)) !== null) {
        const name = match[1] || match[2];
        const params = match[3] || '';
        functions.push({
          name,
          signature: `${name}(${params})`,
          params: params.split(',').map((p) => p.trim()).filter(Boolean),
        });
      }
    }

    return functions;
  }

  /**
   * Find call sites for a function
   */
  async findCallSites(functionName, files) {
    const callSites = [];

    for (const file of files.slice(0, 50)) { // Limit to avoid performance issues
      try {
        const content = await this.gitOps.getFileContent(file, 'HEAD');
        if (!content) continue;

        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes(`${functionName}(`)) {
            callSites.push({
              file,
              line: index + 1,
              code: line.trim(),
            });
          }
        });
      } catch (error) {
        logger.debug(`Failed to search ${file}:`, error.message);
      }
    }

    return callSites;
  }

  /**
   * Detect class/interface renames
   */
  async detectRenames(sourceBranch, targetBranch, changedFiles) {
    const changes = [];

    // Simple heuristic: look for files that were deleted in one branch and added in another
    const deletedFiles = changedFiles.targetFiles.filter(
      (f) => !changedFiles.sourceFiles.includes(f),
    );
    const addedFiles = changedFiles.sourceFiles.filter(
      (f) => !changedFiles.targetFiles.includes(f),
    );

    // Match by similar names
    for (const deleted of deletedFiles) {
      const deletedName = deleted.split('/').pop().replace(/\.[^.]+$/, '');
      
      for (const added of addedFiles) {
        const addedName = added.split('/').pop().replace(/\.[^.]+$/, '');
        
        // Check if names are similar (simple check)
        if (this.areSimilar(deletedName, addedName)) {
          changes.push({
            type: 'file-rename',
            oldPath: deleted,
            newPath: added,
            oldName: deletedName,
            newName: addedName,
            needsUpdate: true,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Check if two names are similar
   */
  areSimilar(name1, name2) {
    // Simple similarity check
    const lower1 = name1.toLowerCase();
    const lower2 = name2.toLowerCase();

    // Exact match
    if (lower1 === lower2) return true;

    // One contains the other
    if (lower1.includes(lower2) || lower2.includes(lower1)) return true;

    // Levenshtein distance < 3
    const distance = this.levenshteinDistance(lower1, lower2);
    return distance < 3;
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i += 1) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j += 1) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i += 1) {
      for (let j = 1; j <= str1.length; j += 1) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Detect API endpoint changes
   */
  async detectAPIChanges(sourceBranch, targetBranch, changedFiles) {
    const changes = [];

    // Look for API route files
    const apiFiles = changedFiles.overlappingFiles.filter(
      (f) => f.includes('route') || f.includes('api') || f.includes('endpoint'),
    );

    for (const file of apiFiles) {
      try {
        const sourceContent = await this.gitOps.getFileContent(file, sourceBranch);
        const targetContent = await this.gitOps.getFileContent(file, targetBranch);

        if (!sourceContent || !targetContent) continue;

        const sourceEndpoints = this.extractEndpoints(sourceContent);
        const targetEndpoints = this.extractEndpoints(targetContent);

        // Find changed endpoints
        for (const sourceEp of sourceEndpoints) {
          const targetEp = targetEndpoints.find((e) => e.path === sourceEp.path);
          
          if (targetEp && sourceEp.method !== targetEp.method) {
            changes.push({
              type: 'api-change',
              file,
              endpoint: sourceEp.path,
              oldMethod: sourceEp.method,
              newMethod: targetEp.method,
              needsUpdate: true,
            });
          }
        }
      } catch (error) {
        logger.debug(`Failed to analyze API file ${file}:`, error.message);
      }
    }

    return changes;
  }

  /**
   * Extract API endpoints from code
   */
  extractEndpoints(content) {
    const endpoints = [];
    const methods = ['get', 'post', 'put', 'patch', 'delete'];

    methods.forEach((method) => {
      const regex = new RegExp(`\\.${method}\\s*\\(\\s*['"]([^'"]+)['"]`, 'gi');
      let match;

      while ((match = regex.exec(content)) !== null) {
        endpoints.push({
          method: method.toUpperCase(),
          path: match[1],
        });
      }
    });

    return endpoints;
  }

  /**
   * Get AI suggestions for structural changes
   */
  async getSuggestions(change) {
    try {
      const result = await this.bobClient.analyzeStructuralChange(
        change,
        change.callSites || [],
      );
      return result.updates || [];
    } catch (error) {
      logger.debug('Failed to get AI suggestions:', error.message);
      return [];
    }
  }

  /**
   * Generate summary
   */
  generateSummary(changes) {
    const byType = changes.reduce((acc, change) => {
      acc[change.type] = (acc[change.type] || 0) + 1;
      return acc;
    }, {});

    const needsUpdate = changes.filter((c) => c.needsUpdate).length;

    return {
      byType,
      needsUpdate,
      totalChanges: changes.length,
      recommendedAction: needsUpdate > 0 ? 'review-structural-changes' : 'no-action-needed',
    };
  }
}

module.exports = StructuralAdvisor;

// Made with Bob
