/**
 * Tier Classifier
 * Classifies merges into Tier 1 (Simple), Tier 2 (Moderate), or Tier 3 (Complex)
 */

const config = require('../utils/config');
const logger = require('../utils/logger');

class TierClassifier {
  constructor() {
    this.tier1MaxDivergence = config.peacemaker.maxDivergenceForTier1;
    this.tier2MaxDivergence = config.peacemaker.maxDivergenceForTier2;
    this.tier1MaxFiles = config.peacemaker.maxFilesForTier1;
    this.tier2MaxFiles = config.peacemaker.maxFilesForTier2;
  }

  /**
   * Classify merge based on divergence, files, and conflicts
   */
  classify(divergence, changedFiles, conflictAnalysis) {
    const factors = this.analyzeFactors(divergence, changedFiles, conflictAnalysis);
    const tier = this.determineTier(factors);
    const recommendation = this.generateRecommendation(tier, factors);

    return {
      tier,
      level: this.getTierLevel(tier),
      factors,
      recommendation,
      canAutoMerge: tier === 1,
      requiresAI: tier === 2,
      requiresManual: tier === 3,
    };
  }

  /**
   * Analyze all factors that contribute to tier classification
   */
  analyzeFactors(divergence, changedFiles, conflictAnalysis) {
    const factors = {
      divergence: {
        value: divergence.totalDivergence,
        score: this.scoreDivergence(divergence.totalDivergence),
        weight: 0.3,
      },
      fileCount: {
        value: changedFiles.totalFiles,
        score: this.scoreFileCount(changedFiles.totalFiles),
        weight: 0.2,
      },
      overlappingFiles: {
        value: changedFiles.overlappingFiles.length,
        score: this.scoreOverlappingFiles(changedFiles.overlappingFiles.length),
        weight: 0.2,
      },
      conflicts: {
        value: conflictAnalysis.totalConflicts,
        score: this.scoreConflicts(conflictAnalysis),
        weight: 0.3,
      },
    };

    // Calculate weighted score
    factors.weightedScore = Object.values(factors).reduce((sum, factor) => {
      if (typeof factor === 'object' && factor.score !== undefined) {
        return sum + (factor.score * factor.weight);
      }
      return sum;
    }, 0);

    return factors;
  }

  /**
   * Score divergence (0-1, higher = more complex)
   */
  scoreDivergence(totalDivergence) {
    if (totalDivergence <= this.tier1MaxDivergence) {
      return 0.1; // Very low complexity
    }
    if (totalDivergence <= this.tier2MaxDivergence) {
      return 0.5; // Moderate complexity
    }
    return 1.0; // High complexity
  }

  /**
   * Score file count (0-1, higher = more complex)
   */
  scoreFileCount(fileCount) {
    if (fileCount <= this.tier1MaxFiles) {
      return 0.1;
    }
    if (fileCount <= this.tier2MaxFiles) {
      return 0.5;
    }
    return 1.0;
  }

  /**
   * Score overlapping files (0-1, higher = more complex)
   */
  scoreOverlappingFiles(overlappingCount) {
    if (overlappingCount === 0) {
      return 0.0; // No overlaps = simple
    }
    if (overlappingCount <= 3) {
      return 0.4;
    }
    if (overlappingCount <= 8) {
      return 0.7;
    }
    return 1.0;
  }

  /**
   * Score conflicts (0-1, higher = more complex)
   */
  scoreConflicts(conflictAnalysis) {
    if (conflictAnalysis.totalConflicts === 0) {
      return 0.0; // No conflicts = simple
    }

    const summary = conflictAnalysis.conflicts.reduce((acc, conflict) => {
      if (conflict.complexity < 0.3) {
        acc.simple += 1;
      } else if (conflict.complexity < 0.7) {
        acc.moderate += 1;
      } else {
        acc.complex += 1;
      }
      return acc;
    }, { simple: 0, moderate: 0, complex: 0 });

    // Weight by complexity
    const complexityScore = (
      (summary.simple * 0.3) +
      (summary.moderate * 0.6) +
      (summary.complex * 1.0)
    ) / conflictAnalysis.totalConflicts;

    return Math.min(complexityScore, 1.0);
  }

  /**
   * Determine tier based on weighted score
   */
  determineTier(factors) {
    const score = factors.weightedScore;

    // Tier 3: High complexity - requires manual intervention
    if (score >= 0.7) {
      return 3;
    }

    // Tier 1: Low complexity - can auto-merge
    if (score <= 0.3) {
      return 1;
    }

    // Tier 2: Moderate complexity - AI assistance helpful
    return 2;
  }

  /**
   * Get tier level name
   */
  getTierLevel(tier) {
    const levels = {
      1: 'simple',
      2: 'moderate',
      3: 'complex',
    };
    return levels[tier] || 'unknown';
  }

  /**
   * Generate recommendation based on tier
   */
  generateRecommendation(tier, factors) {
    const recommendations = {
      1: {
        action: 'auto-merge',
        description: 'Low divergence, no overlapping files. Safe to merge directly.',
        confidence: 'high',
        steps: [
          'Review changes briefly',
          'Merge directly into target branch',
          'Run tests',
        ],
      },
      2: {
        action: 'ai-assisted-merge',
        description: 'Moderate divergence with some conflicts. AI guidance recommended.',
        confidence: 'medium',
        steps: [
          'Run Peacemaker AI analysis',
          'Review AI suggestions',
          'Apply approved resolutions',
          'Validate with pre-checks',
          'Run tests',
        ],
      },
      3: {
        action: 'manual-merge',
        description: 'High complexity or structural changes. Manual review required.',
        confidence: 'low',
        steps: [
          'Review divergence carefully',
          'Understand both sets of changes',
          'Manually resolve conflicts',
          'Consider rebasing instead of merging',
          'Extensive testing required',
        ],
      },
    };

    const recommendation = recommendations[tier];

    // Add specific warnings based on factors
    const warnings = [];
    if (factors.divergence.score >= 0.7) {
      warnings.push('Significant divergence detected - branch is very stale');
    }
    if (factors.conflicts.score >= 0.7) {
      warnings.push('Complex conflicts detected - careful review needed');
    }
    if (factors.overlappingFiles.score >= 0.7) {
      warnings.push('Many overlapping files - high risk of integration issues');
    }

    return {
      ...recommendation,
      warnings,
    };
  }

  /**
   * Generate detailed tier report
   */
  generateReport(classification) {
    return {
      tier: classification.tier,
      level: classification.level,
      canAutoMerge: classification.canAutoMerge,
      requiresAI: classification.requiresAI,
      requiresManual: classification.requiresManual,
      recommendation: classification.recommendation,
      factors: {
        divergence: {
          value: classification.factors.divergence.value,
          score: classification.factors.divergence.score,
          impact: this.getImpactLevel(classification.factors.divergence.score),
        },
        fileCount: {
          value: classification.factors.fileCount.value,
          score: classification.factors.fileCount.score,
          impact: this.getImpactLevel(classification.factors.fileCount.score),
        },
        overlappingFiles: {
          value: classification.factors.overlappingFiles.value,
          score: classification.factors.overlappingFiles.score,
          impact: this.getImpactLevel(classification.factors.overlappingFiles.score),
        },
        conflicts: {
          value: classification.factors.conflicts.value,
          score: classification.factors.conflicts.score,
          impact: this.getImpactLevel(classification.factors.conflicts.score),
        },
      },
      overallScore: classification.factors.weightedScore,
    };
  }

  /**
   * Get impact level from score
   */
  getImpactLevel(score) {
    if (score <= 0.3) return 'low';
    if (score <= 0.7) return 'medium';
    return 'high';
  }
}

module.exports = TierClassifier;

// Made with Bob
