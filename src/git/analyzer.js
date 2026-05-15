/**
 * Conflict Analyzer
 * Analyzes merge conflicts and categorizes them
 */

const logger = require('../utils/logger');

class ConflictAnalyzer {
  constructor(gitOps) {
    this.gitOps = gitOps;
  }

  /**
   * Analyze conflicts from merge simulation
   */
  async analyzeConflicts(mergeResult, sourceBranch, targetBranch) {
    try {
      const conflicts = [];

      for (const conflictFile of mergeResult.conflicts) {
        const analysis = await this.analyzeConflictFile(
          conflictFile,
          sourceBranch,
          targetBranch,
        );
        conflicts.push(analysis);
      }

      return {
        totalConflicts: conflicts.length,
        conflicts,
        hasConflicts: conflicts.length > 0,
      };
    } catch (error) {
      logger.error('Failed to analyze conflicts:', error.message);
      throw error;
    }
  }

  /**
   * Analyze a single conflict file
   */
  async analyzeConflictFile(filePath, sourceBranch, targetBranch) {
    try {
      // Get file content from both branches
      const sourceContent = await this.gitOps.getFileContent(filePath, sourceBranch);
      const targetContent = await this.gitOps.getFileContent(filePath, targetBranch);

      // Get diff
      const diff = await this.gitOps.getDiff(sourceBranch, targetBranch, filePath);

      // Analyze conflict type
      const conflictType = this.detectConflictType(filePath, sourceContent, targetContent);

      // Calculate complexity
      const complexity = this.calculateComplexity(diff, sourceContent, targetContent);

      return {
        file: filePath,
        type: conflictType,
        complexity,
        sourceContent,
        targetContent,
        diff,
        resolvable: complexity < 0.7, // High complexity = harder to auto-resolve
      };
    } catch (error) {
      logger.debug(`Failed to analyze conflict in ${filePath}:`, error.message);
      return {
        file: filePath,
        type: 'unknown',
        complexity: 1.0,
        sourceContent: null,
        targetContent: null,
        diff: null,
        resolvable: false,
        error: error.message,
      };
    }
  }

  /**
   * Detect type of conflict
   */
  detectConflictType(filePath, sourceContent, targetContent) {
    // File deleted in one branch
    if (!sourceContent && targetContent) {
      return 'deleted-in-source';
    }
    if (sourceContent && !targetContent) {
      return 'deleted-in-target';
    }

    // Both branches modified
    if (sourceContent && targetContent) {
      // Check if it's a simple line conflict or structural change
      const sourceLines = sourceContent.split('\n').length;
      const targetLines = targetContent.split('\n').length;
      const lineDiff = Math.abs(sourceLines - targetLines);

      if (lineDiff > sourceLines * 0.3) {
        return 'structural-change';
      }

      return 'content-conflict';
    }

    return 'unknown';
  }

  /**
   * Calculate conflict complexity (0-1 scale)
   * Higher = more complex = harder to resolve
   */
  calculateComplexity(diff, sourceContent, targetContent) {
    if (!diff || !sourceContent || !targetContent) {
      return 1.0; // Maximum complexity if we can't analyze
    }

    let complexity = 0;

    // Factor 1: Number of changed lines
    const diffLines = diff.split('\n').filter((line) => line.startsWith('+') || line.startsWith('-'));
    const totalLines = Math.max(
      sourceContent.split('\n').length,
      targetContent.split('\n').length,
    );
    const changeRatio = diffLines.length / totalLines;
    complexity += changeRatio * 0.4; // 40% weight

    // Factor 2: Structural changes (line count difference)
    const sourceLines = sourceContent.split('\n').length;
    const targetLines = targetContent.split('\n').length;
    const structuralChange = Math.abs(sourceLines - targetLines) / Math.max(sourceLines, targetLines);
    complexity += structuralChange * 0.3; // 30% weight

    // Factor 3: Number of conflict regions (estimated from diff)
    const conflictRegions = (diff.match(/^@@/gm) || []).length;
    const regionComplexity = Math.min(conflictRegions / 5, 1); // Normalize to 0-1
    complexity += regionComplexity * 0.3; // 30% weight

    return Math.min(complexity, 1.0);
  }

  /**
   * Categorize conflicts by severity
   */
  categorizeConflicts(conflicts) {
    const categories = {
      simple: [],
      moderate: [],
      complex: [],
    };

    for (const conflict of conflicts) {
      if (conflict.complexity < 0.3) {
        categories.simple.push(conflict);
      } else if (conflict.complexity < 0.7) {
        categories.moderate.push(conflict);
      } else {
        categories.complex.push(conflict);
      }
    }

    return categories;
  }

  /**
   * Generate conflict summary
   */
  generateSummary(conflictAnalysis) {
    const categories = this.categorizeConflicts(conflictAnalysis.conflicts);

    return {
      total: conflictAnalysis.totalConflicts,
      simple: categories.simple.length,
      moderate: categories.moderate.length,
      complex: categories.complex.length,
      resolvable: conflictAnalysis.conflicts.filter((c) => c.resolvable).length,
      categories,
    };
  }
}

module.exports = ConflictAnalyzer;

// Made with Bob
