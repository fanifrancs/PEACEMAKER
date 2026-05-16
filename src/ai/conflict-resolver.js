/**
 * Conflict Resolution Analyzer (Point 8.1)
 * AI-powered conflict resolution with confidence scoring
 */

const IBMBobClient = require('./ibm-bob-client');
const logger = require('../utils/logger');

class ConflictResolver {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.bobClient = new IBMBobClient();
  }

  /**
   * Resolve all conflicts with AI assistance
   */
  async resolveConflicts(conflicts, sourceBranch, targetBranch, developerIntent) {
    logger.debug(`Resolving ${conflicts.length} conflicts with AI...`);

    const resolutions = [];

    for (const conflict of conflicts) {
      try {
        const resolution = await this.resolveConflict(
          conflict,
          sourceBranch,
          targetBranch,
          developerIntent,
        );
        resolutions.push(resolution);
      } catch (error) {
        logger.warn(`Failed to resolve conflict in ${conflict.file}:`, error.message);
        resolutions.push(this.createFailedResolution(conflict, error));
      }
    }

    return {
      total: conflicts.length,
      resolved: resolutions.filter((r) => r.success).length,
      failed: resolutions.filter((r) => !r.success).length,
      resolutions,
    };
  }

  /**
   * Resolve a single conflict
   */
  async resolveConflict(conflict, sourceBranch, targetBranch, developerIntent) {
    logger.debug(`Analyzing conflict in ${conflict.file}...`);

    // Get file versions
    const versions = await this.getFileVersions(
      conflict.file,
      sourceBranch,
      targetBranch,
    );

    // Get surrounding context
    const context = await this.getSurroundingContext(
      conflict.file,
      sourceBranch,
      versions.feature,
    );

    // Determine conflict type
    const conflictType = this.determineConflictType(versions);

    // Build resolution context
    const resolutionContext = {
      file: conflict.file,
      conflictType,
      developerIntent: developerIntent?.intent || 'Unknown',
      baseVersion: versions.base,
      featureVersion: versions.feature,
      targetVersion: versions.target,
      surroundingCode: context,
    };

    // Get AI resolution
    const aiResolution = await this.bobClient.resolveConflict(resolutionContext);

    // Validate resolution
    const validation = this.validateResolution(aiResolution, versions);

    return {
      success: validation.valid,
      file: conflict.file,
      conflictType,
      resolution: {
        suggestedCode: aiResolution.suggestedCode,
        reasoning: aiResolution.reasoning,
        confidence: aiResolution.confidence,
        approach: aiResolution.approach,
      },
      validation,
      originalConflict: conflict,
    };
  }

  /**
   * Get file versions (base, feature, target)
   */
  async getFileVersions(file, sourceBranch, targetBranch) {
    try {
      // Get fork point for base version
      const forkPoint = await this.gitOps.detectForkPoint(sourceBranch, targetBranch);

      // Get versions
      const base = await this.gitOps.getFileContent(file, forkPoint.hash);
      const feature = await this.gitOps.getFileContent(file, sourceBranch);
      const target = await this.gitOps.getFileContent(file, targetBranch);

      return { base, feature, target };
    } catch (error) {
      logger.debug(`Failed to get file versions for ${file}:`, error.message);
      return { base: null, feature: null, target: null };
    }
  }

  /**
   * Get surrounding context for conflict
   */
  async getSurroundingContext(file, branch, content) {
    if (!content) return '';

    // For now, return first 20 lines and last 20 lines
    // In production, would identify conflict markers and get context around them
    const lines = content.split('\n');
    const contextLines = 20;

    if (lines.length <= contextLines * 2) {
      return content;
    }

    const start = lines.slice(0, contextLines).join('\n');
    const end = lines.slice(-contextLines).join('\n');

    return `${start}\n\n... (${lines.length - contextLines * 2} lines omitted) ...\n\n${end}`;
  }

  /**
   * Determine type of conflict
   */
  determineConflictType(versions) {
    const { base, feature, target } = versions;

    // File deleted in one branch
    if (!feature && target) {
      return 'deleted-in-feature';
    }
    if (feature && !target) {
      return 'deleted-in-target';
    }

    // File added in both branches
    if (!base && feature && target) {
      return 'added-in-both';
    }

    // Modified in both branches
    if (base && feature && target) {
      // Check if it's a simple content conflict or structural change
      const featureLines = feature.split('\n').length;
      const targetLines = target.split('\n').length;
      const baseLines = base.split('\n').length;

      const featureDiff = Math.abs(featureLines - baseLines);
      const targetDiff = Math.abs(targetLines - baseLines);

      if (featureDiff > baseLines * 0.3 || targetDiff > baseLines * 0.3) {
        return 'structural-change';
      }

      return 'content-conflict';
    }

    return 'unknown';
  }

  /**
   * Validate AI resolution
   */
  validateResolution(resolution, versions) {
    const issues = [];
    let valid = true;

    // Check if resolution was provided
    if (!resolution.suggestedCode) {
      issues.push('No resolution code provided');
      valid = false;
    }

    // Check confidence threshold
    if (resolution.confidence < 0.5) {
      issues.push('Low confidence resolution (< 50%)');
      // Don't mark as invalid, but warn
    }

    // Check for conflict markers in resolution
    if (resolution.suggestedCode && this.hasConflictMarkers(resolution.suggestedCode)) {
      issues.push('Resolution still contains conflict markers');
      valid = false;
    }

    // Check if resolution is significantly different from both versions
    if (resolution.suggestedCode && versions.feature && versions.target) {
      const similarity = this.calculateSimilarity(
        resolution.suggestedCode,
        versions.feature,
        versions.target,
      );

      if (similarity < 0.3) {
        issues.push('Resolution differs significantly from both versions');
        // Don't mark as invalid, but warn
      }
    }

    return {
      valid,
      issues,
      warnings: issues.filter((i) => !i.includes('No resolution') && !i.includes('conflict markers')),
    };
  }

  /**
   * Check if code contains conflict markers
   */
  hasConflictMarkers(code) {
    const markers = ['<<<<<<<', '=======', '>>>>>>>'];
    return markers.some((marker) => code.includes(marker));
  }

  /**
   * Calculate similarity between resolution and original versions
   */
  calculateSimilarity(resolution, feature, target) {
    // Simple line-based similarity
    const resLines = new Set(resolution.split('\n').map((l) => l.trim()).filter(Boolean));
    const featureLines = new Set(feature.split('\n').map((l) => l.trim()).filter(Boolean));
    const targetLines = new Set(target.split('\n').map((l) => l.trim()).filter(Boolean));

    // Count lines that appear in resolution and at least one original version
    let matchCount = 0;
    resLines.forEach((line) => {
      if (featureLines.has(line) || targetLines.has(line)) {
        matchCount += 1;
      }
    });

    return resLines.size > 0 ? matchCount / resLines.size : 0;
  }

  /**
   * Create failed resolution object
   */
  createFailedResolution(conflict, error) {
    return {
      success: false,
      file: conflict.file,
      conflictType: 'unknown',
      resolution: null,
      validation: {
        valid: false,
        issues: [error.message],
        warnings: [],
      },
      originalConflict: conflict,
      error: error.message,
    };
  }

  /**
   * Generate resolution summary
   */
  generateSummary(resolutionResult) {
    const { total, resolved, failed, resolutions } = resolutionResult;

    // Calculate average confidence
    const avgConfidence = resolutions
      .filter((r) => r.success && r.resolution)
      .reduce((sum, r) => sum + r.resolution.confidence, 0) / (resolved || 1);

    // Group by approach
    const approaches = resolutions
      .filter((r) => r.success && r.resolution)
      .reduce((acc, r) => {
        const approach = r.resolution.approach;
        acc[approach] = (acc[approach] || 0) + 1;
        return acc;
      }, {});

    // Identify high-confidence resolutions
    const highConfidence = resolutions.filter(
      (r) => r.success && r.resolution && r.resolution.confidence >= 0.8,
    );

    return {
      total,
      resolved,
      failed,
      avgConfidence: Math.round(avgConfidence * 100),
      approaches,
      highConfidenceCount: highConfidence.length,
      recommendedAction: this.getRecommendedAction(resolutionResult),
    };
  }

  /**
   * Get recommended action based on resolution results
   */
  getRecommendedAction(resolutionResult) {
    const { total, resolved, resolutions } = resolutionResult;

    if (resolved === 0) {
      return 'manual-review-required';
    }

    const avgConfidence = resolutions
      .filter((r) => r.success && r.resolution)
      .reduce((sum, r) => sum + r.resolution.confidence, 0) / resolved;

    if (avgConfidence >= 0.8 && resolved === total) {
      return 'apply-all-suggestions';
    }

    if (avgConfidence >= 0.6) {
      return 'review-and-apply';
    }

    return 'careful-review-required';
  }
}

module.exports = ConflictResolver;

// Made with Bob
