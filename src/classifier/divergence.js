const logger = require('../utils/logger');

/**
 * Classifies merge complexity into three tiers:
 * - Tier 1 (Minor): Small divergence, few conflicts - direct merge
 * - Tier 2 (Moderate): Significant divergence - intent replay needed
 * - Tier 3 (Critical): Massive divergence - too risky, diagnostic report
 */
class DivergenceClassifier {
  constructor() {
    // Thresholds for classification
    this.thresholds = {
      tier1: {
        maxCommitsBehind: 10,   // Small divergence — branch is recent
        maxCommitsAhead: 10,    // Small feature — few commits
        maxChangedFiles: 5,     // Narrow scope — touched few files
        maxConflicts: 0         // Zero conflicts — clean fast-path
      },
      tier2: {
        maxCommitsBehind: 100,
        maxCommitsAhead: 100,
        maxChangedFiles: 100,
        maxConflicts: 30
      }
      // Tier 3: anything beyond Tier 2 thresholds
    };
  }

  /**
   * Analyzes branch divergence and classifies merge complexity
   * @param {Object} metrics - Branch metrics
   * @param {number} metrics.commitsBehind - Commits behind base branch
   * @param {number} metrics.commitsAhead - Commits ahead of base branch
   * @param {Array<string>} metrics.changedFiles - List of changed files
   * @param {Array<string>} metrics.conflictingFiles - List of conflicting files
   * @returns {Object} Classification result with tier, reasoning, and recommendations
   */
  classify(metrics) {
    const { commitsBehind, commitsAhead, changedFiles, conflictingFiles } = metrics;
    
    logger.debug('Classifying divergence with metrics:', {
      commitsBehind,
      commitsAhead,
      changedFilesCount: changedFiles.length,
      conflictingFilesCount: conflictingFiles.length
    });

    // Calculate risk scores
    const scores = this._calculateRiskScores(metrics);
    
    // Determine tier
    const tier = this._determineTier(scores, metrics);
    
    // Generate reasoning and recommendations
    const result = {
      tier,
      scores,
      reasoning: this._generateReasoning(tier, metrics, scores),
      recommendations: this._generateRecommendations(tier, metrics),
      metrics: {
        commitsBehind,
        commitsAhead,
        changedFilesCount: changedFiles.length,
        conflictingFilesCount: conflictingFiles.length
      }
    };

    logger.info(`Branch classified as Tier ${tier}: ${result.reasoning.summary}`);
    
    return result;
  }

  /**
   * Calculate risk scores for different aspects of the merge
   * @private
   */
  _calculateRiskScores(metrics) {
    const { commitsBehind, commitsAhead, changedFiles, conflictingFiles } = metrics;
    
    // Divergence score (0-100)
    const divergenceScore = Math.min(100, 
      (commitsBehind / this.thresholds.tier2.maxCommitsBehind) * 50 +
      (commitsAhead / this.thresholds.tier2.maxCommitsAhead) * 50
    );

    // Complexity score (0-100)
    const complexityScore = Math.min(100,
      (changedFiles.length / this.thresholds.tier2.maxChangedFiles) * 100
    );

    // Conflict score (0-100)
    const conflictScore = Math.min(100,
      (conflictingFiles.length / this.thresholds.tier2.maxConflicts) * 100
    );

    // Overall risk score (weighted average)
    const overallRisk = Math.round(
      divergenceScore * 0.4 +
      complexityScore * 0.3 +
      conflictScore * 0.3
    );

    return {
      divergence: Math.round(divergenceScore),
      complexity: Math.round(complexityScore),
      conflict: Math.round(conflictScore),
      overall: overallRisk
    };
  }

  /**
   * Determine tier based on scores and metrics
   * @private
   */
  _determineTier(scores, metrics) {
    const { commitsBehind, commitsAhead, changedFiles, conflictingFiles } = metrics;
    const t1 = this.thresholds.tier1;
    const t2 = this.thresholds.tier2;

    // Tier 3: Critical - exceeds Tier 2 thresholds
    if (
      commitsBehind > t2.maxCommitsBehind ||
      commitsAhead > t2.maxCommitsAhead ||
      changedFiles.length > t2.maxChangedFiles ||
      conflictingFiles.length > t2.maxConflicts ||
      scores.overall > 80
    ) {
      return 3;
    }

    // Tier 1: Minor - within Tier 1 thresholds
    if (
      commitsBehind <= t1.maxCommitsBehind &&
      commitsAhead <= t1.maxCommitsAhead &&
      changedFiles.length <= t1.maxChangedFiles &&
      conflictingFiles.length <= t1.maxConflicts &&
      scores.overall < 30
    ) {
      return 1;
    }

    // Tier 2: Moderate - everything else
    return 2;
  }

  /**
   * Generate human-readable reasoning for the classification
   * @private
   */
  _generateReasoning(tier, metrics, scores) {
    const { commitsBehind, commitsAhead, changedFiles, conflictingFiles } = metrics;
    
    const reasons = [];
    
    // Divergence reasoning
    if (commitsBehind > 0) {
      reasons.push(`${commitsBehind} commit${commitsBehind > 1 ? 's' : ''} behind base branch`);
    }
    if (commitsAhead > 0) {
      reasons.push(`${commitsAhead} commit${commitsAhead > 1 ? 's' : ''} ahead of base branch`);
    }
    
    // File change reasoning
    if (changedFiles.length > 0) {
      reasons.push(`${changedFiles.length} file${changedFiles.length > 1 ? 's' : ''} modified`);
    }
    
    // Conflict reasoning
    if (conflictingFiles.length > 0) {
      reasons.push(`${conflictingFiles.length} potential conflict${conflictingFiles.length > 1 ? 's' : ''} detected`);
    }

    let summary;
    let details;

    switch (tier) {
      case 1:
        summary = 'Minor divergence - safe for direct merge';
        details = 'The branch has minimal divergence from the base branch. ' +
                 'Changes are small and conflicts are minimal or non-existent. ' +
                 'Semantic resolution can handle this merge directly.';
        break;
      
      case 2:
        summary = 'Moderate divergence - intent replay recommended';
        details = 'The branch has significant divergence from the base branch. ' +
                 'Intent extraction and replay via IBM Bob will ensure clean integration. ' +
                 'This is the ideal use case for Peacemaker\'s semantic merge capabilities.';
        break;
      
      case 3:
        summary = 'Critical divergence - merge too risky';
        details = 'The branch has massive divergence from the base branch. ' +
                 'The risk of integration issues is too high for automated resolution. ' +
                 'A diagnostic report will be generated to help plan manual intervention.';
        break;
    }

    return {
      summary,
      details,
      factors: reasons,
      riskLevel: tier === 1 ? 'LOW' : tier === 2 ? 'MODERATE' : 'HIGH'
    };
  }

  /**
   * Generate recommendations based on tier
   * @private
   */
  _generateRecommendations(tier, metrics) {
    const recommendations = [];

    switch (tier) {
      case 1:
        recommendations.push('Proceed with semantic merge resolution');
        recommendations.push('Review changes before finalizing');
        if (metrics.conflictingFiles.length > 0) {
          recommendations.push('Pay special attention to conflicting files');
        }
        break;

      case 2:
        recommendations.push('Use intent extraction and replay via IBM Bob');
        recommendations.push('Review the intent summary before approval');
        recommendations.push('Verify the replayed changes match expected behavior');
        if (metrics.commitsBehind > 20) {
          recommendations.push('Consider rebasing the feature branch first for cleaner history');
        }
        break;

      case 3:
        recommendations.push('DO NOT attempt automated merge');
        recommendations.push('Review the diagnostic report carefully');
        recommendations.push('Consider breaking the feature into smaller, incremental merges');
        recommendations.push('Coordinate with the feature branch author for manual resolution');
        if (metrics.commitsBehind > 100) {
          recommendations.push('The base branch has moved significantly - consider starting fresh');
        }
        break;
    }

    return recommendations;
  }

  /**
   * Get a detailed breakdown of what makes a merge risky
   * @param {Object} metrics - Branch metrics
   * @returns {Object} Risk breakdown by category
   */
  getRiskBreakdown(metrics) {
    const { commitsBehind, commitsAhead, changedFiles, conflictingFiles } = metrics;
    
    return {
      divergence: {
        level: this._getRiskLevel(commitsBehind, this.thresholds.tier1.maxCommitsBehind, this.thresholds.tier2.maxCommitsBehind),
        value: commitsBehind,
        description: `Branch is ${commitsBehind} commits behind`
      },
      advancement: {
        level: this._getRiskLevel(commitsAhead, this.thresholds.tier1.maxCommitsAhead, this.thresholds.tier2.maxCommitsAhead),
        value: commitsAhead,
        description: `Branch is ${commitsAhead} commits ahead`
      },
      fileChanges: {
        level: this._getRiskLevel(changedFiles.length, this.thresholds.tier1.maxChangedFiles, this.thresholds.tier2.maxChangedFiles),
        value: changedFiles.length,
        description: `${changedFiles.length} files changed`
      },
      conflicts: {
        level: this._getRiskLevel(conflictingFiles.length, this.thresholds.tier1.maxConflicts, this.thresholds.tier2.maxConflicts),
        value: conflictingFiles.length,
        description: `${conflictingFiles.length} potential conflicts`
      }
    };
  }

  /**
   * Helper to determine risk level for a metric
   * @private
   */
  _getRiskLevel(value, tier1Max, tier2Max) {
    if (value <= tier1Max) return 'LOW';
    if (value <= tier2Max) return 'MODERATE';
    return 'HIGH';
  }
}

module.exports = DivergenceClassifier;

// Made with Bob