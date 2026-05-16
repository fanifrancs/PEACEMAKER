const TierClassifier = require('./classifier');

describe('TierClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new TierClassifier();
  });

  describe('classify', () => {
    it('should classify as Tier 1 for simple merges', () => {
      const divergence = { totalDivergence: 5 };
      const changedFiles = {
        totalFiles: 3,
        overlappingFiles: [],
      };
      const conflictAnalysis = {
        totalConflicts: 0,
        conflicts: [],
      };

      const result = classifier.classify(divergence, changedFiles, conflictAnalysis);

      expect(result.tier).toBe(1);
      expect(result.level).toBe('simple');
      expect(result.canAutoMerge).toBe(true);
      expect(result.requiresAI).toBe(false);
      expect(result.requiresManual).toBe(false);
    });

    it('should classify as Tier 2 for moderate merges', () => {
      const divergence = { totalDivergence: 15 };
      const changedFiles = {
        totalFiles: 8,
        overlappingFiles: ['file1.js', 'file2.js'],
      };
      const conflictAnalysis = {
        totalConflicts: 2,
        conflicts: [
          { complexity: 0.4 },
          { complexity: 0.5 },
        ],
      };

      const result = classifier.classify(divergence, changedFiles, conflictAnalysis);

      expect(result.tier).toBe(2);
      expect(result.level).toBe('moderate');
      expect(result.canAutoMerge).toBe(false);
      expect(result.requiresAI).toBe(true);
      expect(result.requiresManual).toBe(false);
    });

    it('should classify as Tier 3 for complex merges', () => {
      const divergence = { totalDivergence: 50 };
      const changedFiles = {
        totalFiles: 25,
        overlappingFiles: Array(10).fill('file.js'),
      };
      const conflictAnalysis = {
        totalConflicts: 8,
        conflicts: Array(8).fill({ complexity: 0.8 }),
      };

      const result = classifier.classify(divergence, changedFiles, conflictAnalysis);

      expect(result.tier).toBe(3);
      expect(result.level).toBe('complex');
      expect(result.canAutoMerge).toBe(false);
      expect(result.requiresAI).toBe(false);
      expect(result.requiresManual).toBe(true);
    });
  });

  describe('analyzeFactors', () => {
    it('should calculate weighted score correctly', () => {
      const divergence = { totalDivergence: 10 };
      const changedFiles = {
        totalFiles: 5,
        overlappingFiles: ['file1.js'],
      };
      const conflictAnalysis = {
        totalConflicts: 1,
        conflicts: [{ complexity: 0.3 }],
      };

      const factors = classifier.analyzeFactors(divergence, changedFiles, conflictAnalysis);

      expect(factors.weightedScore).toBeGreaterThan(0);
      expect(factors.weightedScore).toBeLessThan(1);
      expect(factors.divergence).toBeDefined();
      expect(factors.fileCount).toBeDefined();
      expect(factors.overlappingFiles).toBeDefined();
      expect(factors.conflicts).toBeDefined();
    });

    it('should assign correct weights to factors', () => {
      const divergence = { totalDivergence: 5 };
      const changedFiles = {
        totalFiles: 3,
        overlappingFiles: [],
      };
      const conflictAnalysis = {
        totalConflicts: 0,
        conflicts: [],
      };

      const factors = classifier.analyzeFactors(divergence, changedFiles, conflictAnalysis);

      expect(factors.divergence.weight).toBe(0.3);
      expect(factors.fileCount.weight).toBe(0.2);
      expect(factors.overlappingFiles.weight).toBe(0.2);
      expect(factors.conflicts.weight).toBe(0.3);
    });
  });

  describe('scoreDivergence', () => {
    it('should return low score for small divergence', () => {
      const score = classifier.scoreDivergence(5);
      expect(score).toBe(0.1);
    });

    it('should return medium score for moderate divergence', () => {
      const score = classifier.scoreDivergence(15);
      expect(score).toBe(0.5);
    });

    it('should return high score for large divergence', () => {
      const score = classifier.scoreDivergence(50);
      expect(score).toBe(1.0);
    });
  });

  describe('scoreFileCount', () => {
    it('should return low score for few files', () => {
      const score = classifier.scoreFileCount(3);
      expect(score).toBe(0.1);
    });

    it('should return medium score for moderate files', () => {
      const score = classifier.scoreFileCount(8);
      expect(score).toBe(0.5);
    });

    it('should return high score for many files', () => {
      const score = classifier.scoreFileCount(25);
      expect(score).toBe(1.0);
    });
  });

  describe('scoreOverlappingFiles', () => {
    it('should return 0 for no overlapping files', () => {
      const score = classifier.scoreOverlappingFiles(0);
      expect(score).toBe(0.0);
    });

    it('should return low score for few overlapping files', () => {
      const score = classifier.scoreOverlappingFiles(2);
      expect(score).toBe(0.4);
    });

    it('should return medium score for moderate overlapping files', () => {
      const score = classifier.scoreOverlappingFiles(5);
      expect(score).toBe(0.7);
    });

    it('should return high score for many overlapping files', () => {
      const score = classifier.scoreOverlappingFiles(10);
      expect(score).toBe(1.0);
    });
  });

  describe('scoreConflicts', () => {
    it('should return 0 for no conflicts', () => {
      const conflictAnalysis = {
        totalConflicts: 0,
        conflicts: [],
      };
      const score = classifier.scoreConflicts(conflictAnalysis);
      expect(score).toBe(0.0);
    });

    it('should score simple conflicts lower', () => {
      const conflictAnalysis = {
        totalConflicts: 3,
        conflicts: [
          { complexity: 0.2 },
          { complexity: 0.1 },
          { complexity: 0.25 },
        ],
      };
      const score = classifier.scoreConflicts(conflictAnalysis);
      expect(score).toBeLessThan(0.5);
    });

    it('should score complex conflicts higher', () => {
      const conflictAnalysis = {
        totalConflicts: 3,
        conflicts: [
          { complexity: 0.8 },
          { complexity: 0.9 },
          { complexity: 0.85 },
        ],
      };
      const score = classifier.scoreConflicts(conflictAnalysis);
      expect(score).toBeGreaterThan(0.7);
    });

    it('should handle mixed complexity conflicts', () => {
      const conflictAnalysis = {
        totalConflicts: 4,
        conflicts: [
          { complexity: 0.2 },
          { complexity: 0.5 },
          { complexity: 0.8 },
          { complexity: 0.3 },
        ],
      };
      const score = classifier.scoreConflicts(conflictAnalysis);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('determineTier', () => {
    it('should return Tier 1 for low weighted score', () => {
      const factors = { weightedScore: 0.2 };
      const tier = classifier.determineTier(factors);
      expect(tier).toBe(1);
    });

    it('should return Tier 2 for medium weighted score', () => {
      const factors = { weightedScore: 0.5 };
      const tier = classifier.determineTier(factors);
      expect(tier).toBe(2);
    });

    it('should return Tier 3 for high weighted score', () => {
      const factors = { weightedScore: 0.8 };
      const tier = classifier.determineTier(factors);
      expect(tier).toBe(3);
    });

    it('should handle boundary cases correctly', () => {
      expect(classifier.determineTier({ weightedScore: 0.3 })).toBe(1);
      expect(classifier.determineTier({ weightedScore: 0.31 })).toBe(2);
      expect(classifier.determineTier({ weightedScore: 0.69 })).toBe(2);
      expect(classifier.determineTier({ weightedScore: 0.7 })).toBe(3);
    });
  });

  describe('getTierLevel', () => {
    it('should return correct level names', () => {
      expect(classifier.getTierLevel(1)).toBe('simple');
      expect(classifier.getTierLevel(2)).toBe('moderate');
      expect(classifier.getTierLevel(3)).toBe('complex');
    });

    it('should return unknown for invalid tier', () => {
      expect(classifier.getTierLevel(4)).toBe('unknown');
      expect(classifier.getTierLevel(0)).toBe('unknown');
    });
  });

  describe('generateRecommendation', () => {
    it('should generate auto-merge recommendation for Tier 1', () => {
      const factors = {
        divergence: { score: 0.1 },
        conflicts: { score: 0.0 },
        overlappingFiles: { score: 0.0 },
      };
      const recommendation = classifier.generateRecommendation(1, factors);

      expect(recommendation.action).toBe('auto-merge');
      expect(recommendation.confidence).toBe('high');
      expect(recommendation.steps).toHaveLength(3);
      expect(recommendation.warnings).toHaveLength(0);
    });

    it('should generate AI-assisted recommendation for Tier 2', () => {
      const factors = {
        divergence: { score: 0.5 },
        conflicts: { score: 0.4 },
        overlappingFiles: { score: 0.3 },
      };
      const recommendation = classifier.generateRecommendation(2, factors);

      expect(recommendation.action).toBe('ai-assisted-merge');
      expect(recommendation.confidence).toBe('medium');
      expect(recommendation.steps).toHaveLength(5);
    });

    it('should generate manual recommendation for Tier 3', () => {
      const factors = {
        divergence: { score: 0.9 },
        conflicts: { score: 0.8 },
        overlappingFiles: { score: 0.7 },
      };
      const recommendation = classifier.generateRecommendation(3, factors);

      expect(recommendation.action).toBe('manual-merge');
      expect(recommendation.confidence).toBe('low');
      expect(recommendation.steps).toHaveLength(5);
      expect(recommendation.warnings.length).toBeGreaterThan(0);
    });

    it('should include warnings for high factor scores', () => {
      const factors = {
        divergence: { score: 0.8 },
        conflicts: { score: 0.9 },
        overlappingFiles: { score: 0.75 },
      };
      const recommendation = classifier.generateRecommendation(3, factors);

      expect(recommendation.warnings).toContain('Significant divergence detected - branch is very stale');
      expect(recommendation.warnings).toContain('Complex conflicts detected - careful review needed');
      expect(recommendation.warnings).toContain('Many overlapping files - high risk of integration issues');
    });
  });

  describe('generateReport', () => {
    it('should generate complete report', () => {
      const classification = {
        tier: 2,
        level: 'moderate',
        canAutoMerge: false,
        requiresAI: true,
        requiresManual: false,
        recommendation: {
          action: 'ai-assisted-merge',
          confidence: 'medium',
        },
        factors: {
          divergence: { value: 15, score: 0.5 },
          fileCount: { value: 8, score: 0.5 },
          overlappingFiles: { value: 2, score: 0.4 },
          conflicts: { value: 2, score: 0.4 },
          weightedScore: 0.46,
        },
      };

      const report = classifier.generateReport(classification);

      expect(report.tier).toBe(2);
      expect(report.level).toBe('moderate');
      expect(report.factors.divergence.impact).toBe('medium');
      expect(report.overallScore).toBe(0.46);
    });
  });

  describe('getImpactLevel', () => {
    it('should return correct impact levels', () => {
      expect(classifier.getImpactLevel(0.2)).toBe('low');
      expect(classifier.getImpactLevel(0.5)).toBe('medium');
      expect(classifier.getImpactLevel(0.8)).toBe('high');
    });

    it('should handle boundary cases', () => {
      expect(classifier.getImpactLevel(0.3)).toBe('low');
      expect(classifier.getImpactLevel(0.31)).toBe('medium');
      expect(classifier.getImpactLevel(0.7)).toBe('medium');
      expect(classifier.getImpactLevel(0.71)).toBe('high');
    });
  });

  describe('edge cases', () => {
    it('should handle zero values gracefully', () => {
      const divergence = { totalDivergence: 0 };
      const changedFiles = {
        totalFiles: 0,
        overlappingFiles: [],
      };
      const conflictAnalysis = {
        totalConflicts: 0,
        conflicts: [],
      };

      const result = classifier.classify(divergence, changedFiles, conflictAnalysis);
      expect(result.tier).toBe(1);
    });

    it('should handle very large values', () => {
      const divergence = { totalDivergence: 1000 };
      const changedFiles = {
        totalFiles: 500,
        overlappingFiles: Array(100).fill('file.js'),
      };
      const conflictAnalysis = {
        totalConflicts: 50,
        conflicts: Array(50).fill({ complexity: 0.9 }),
      };

      const result = classifier.classify(divergence, changedFiles, conflictAnalysis);
      expect(result.tier).toBe(3);
    });

    it('should handle missing conflict complexity', () => {
      const conflictAnalysis = {
        totalConflicts: 2,
        conflicts: [
          { complexity: 0.5 },
          {}, // Missing complexity
        ],
      };

      const score = classifier.scoreConflicts(conflictAnalysis);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});

// Made with Bob
