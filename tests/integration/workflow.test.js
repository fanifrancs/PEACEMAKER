/**
 * Integration Tests for End-to-End Workflows
 * Tests the complete flow from analysis to patch application
 */

const TierClassifier = require('../../src/core/classifier');
const ConflictResolver = require('../../src/ai/conflict-resolver');
const PatchGenerator = require('../../src/patch/patch-generator');
const { MockGitOperations, MockBobClient } = require('../helpers/mocks');

jest.mock('../../src/ai/ibm-bob-client');
jest.mock('../../src/utils/logger');

describe('Integration: Complete Workflow', () => {
  let classifier;
  let resolver;
  let patchGenerator;
  let mockGitOps;

  beforeEach(() => {
    mockGitOps = new MockGitOperations();
    classifier = new TierClassifier();
    resolver = new ConflictResolver(mockGitOps);
    patchGenerator = new PatchGenerator(mockGitOps);
  });

  describe('Tier 1: Simple Merge Workflow', () => {
    it('should classify and recommend auto-merge for simple changes', async () => {
      // Setup: Simple merge scenario
      const divergence = { totalDivergence: 3 };
      const changedFiles = {
        totalFiles: 2,
        overlappingFiles: [],
      };
      const conflictAnalysis = {
        totalConflicts: 0,
        conflicts: [],
      };

      // Step 1: Classify
      const classification = classifier.classify(divergence, changedFiles, conflictAnalysis);

      // Assertions
      expect(classification.tier).toBe(1);
      expect(classification.canAutoMerge).toBe(true);
      expect(classification.recommendation.action).toBe('auto-merge');
      expect(classification.recommendation.confidence).toBe('high');
    });
  });

  describe('Tier 2: AI-Assisted Merge Workflow', () => {
    it('should complete full AI-assisted resolution workflow', async () => {
      // Setup: Moderate complexity merge
      const divergence = { totalDivergence: 15 };
      const changedFiles = {
        totalFiles: 8,
        overlappingFiles: ['file1.js', 'file2.js'],
      };
      const conflictAnalysis = {
        totalConflicts: 2,
        conflicts: [
          {
            file: 'file1.js',
            type: 'content',
            complexity: 0.4,
          },
          {
            file: 'file2.js',
            type: 'content',
            complexity: 0.5,
          },
        ],
      };

      // Step 1: Classify
      const classification = classifier.classify(divergence, changedFiles, conflictAnalysis);
      expect(classification.tier).toBe(2);
      expect(classification.requiresAI).toBe(true);

      // Step 2: Mock AI resolution
      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn()
        .mockResolvedValue('const x = 0;');

      resolver.bobClient.resolveConflict = jest.fn().mockResolvedValue({
        suggestedCode: 'const x = 3;',
        reasoning: 'Merged both changes intelligently',
        confidence: 0.85,
        approach: 'accept-both',
      });

      // Step 3: Resolve conflicts
      const resolutionResult = await resolver.resolveConflicts(
        conflictAnalysis.conflicts,
        'feature/test',
        'main',
        { intent: 'Update functionality' }
      );

      expect(resolutionResult.resolved).toBe(2);
      expect(resolutionResult.failed).toBe(0);

      // Step 4: Generate patches
      const approvedSuggestions = resolutionResult.resolutions
        .filter(r => r.success)
        .map(r => ({
          type: 'conflict-resolution',
          file: r.file,
          resolution: r.resolution,
          conflictType: r.conflictType,
        }));

      mockGitOps.readFile = jest.fn().mockResolvedValue(
        '<<<<<<< HEAD\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> main'
      );

      const patches = await patchGenerator.generatePatches(approvedSuggestions);

      expect(patches.conflicts.length).toBeGreaterThan(0);
      expect(patches.metadata.generatedPatches).toBeGreaterThan(0);
    });
  });

  describe('Tier 3: Manual Review Workflow', () => {
    it('should classify complex merges requiring manual intervention', async () => {
      // Setup: Complex merge scenario
      const divergence = { totalDivergence: 50 };
      const changedFiles = {
        totalFiles: 30,
        overlappingFiles: Array(15).fill('file.js'),
      };
      const conflictAnalysis = {
        totalConflicts: 10,
        conflicts: Array(10).fill({ complexity: 0.9 }),
      };

      // Step 1: Classify
      const classification = classifier.classify(divergence, changedFiles, conflictAnalysis);

      // Assertions
      expect(classification.tier).toBe(3);
      expect(classification.requiresManual).toBe(true);
      expect(classification.recommendation.action).toBe('manual-merge');
      expect(classification.recommendation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Mixed Suggestion Types Workflow', () => {
    it('should handle conflicts, imports, and dependencies together', async () => {
      const suggestions = [
        {
          type: 'conflict-resolution',
          file: 'app.js',
          resolution: {
            suggestedCode: 'const merged = true;',
            confidence: 0.85,
            approach: 'accept-both',
            reasoning: 'Combined changes',
          },
          conflictType: 'content-conflict',
        },
        {
          type: 'import-fix',
          file: 'utils.js',
          oldPath: '../helper',
          newPath: '../../helper',
          line: 1,
          confidence: 0.9,
          importType: 'relative',
        },
        {
          type: 'dependency-update',
          file: 'package.json',
          package: 'react',
          sourceVersion: '^17.0.0',
          targetVersion: '^18.0.0',
          suggestion: '^18.2.0',
          confidence: 0.8,
          reasoning: 'Use latest stable',
        },
      ];

      mockGitOps.readFile = jest.fn()
        .mockResolvedValueOnce('<<<<<<< HEAD\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> main')
        .mockResolvedValueOnce('import helper from "../helper";\n')
        .mockResolvedValueOnce(JSON.stringify({ dependencies: { react: '^17.0.0' } }, null, 2));

      const patches = await patchGenerator.generatePatches(suggestions);

      expect(patches.conflicts).toHaveLength(1);
      expect(patches.imports).toHaveLength(1);
      expect(patches.dependencies).toHaveLength(1);
      expect(patches.metadata.generatedPatches).toBe(3);
    });
  });

  describe('Error Recovery Workflow', () => {
    it('should handle partial failures gracefully', async () => {
      const conflicts = [
        { file: 'success.js', type: 'content', complexity: 0.3 },
        { file: 'failure.js', type: 'content', complexity: 0.4 },
      ];

      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn().mockResolvedValue('const x = 0;');

      resolver.bobClient.resolveConflict = jest.fn()
        .mockResolvedValueOnce({
          suggestedCode: 'const x = 3;',
          confidence: 0.85,
          approach: 'accept-both',
          reasoning: 'Success',
        })
        .mockRejectedValueOnce(new Error('AI service error'));

      const result = await resolver.resolveConflicts(
        conflicts,
        'feature/test',
        'main',
        { intent: 'Test' }
      );

      expect(result.total).toBe(2);
      expect(result.resolved).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.resolutions).toHaveLength(2);
    });
  });

  describe('High Confidence Auto-Apply Workflow', () => {
    it('should identify high-confidence resolutions for auto-apply', async () => {
      const conflicts = [
        { file: 'file1.js', type: 'content', complexity: 0.2 },
        { file: 'file2.js', type: 'content', complexity: 0.3 },
        { file: 'file3.js', type: 'content', complexity: 0.4 },
      ];

      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn().mockResolvedValue('const x = 0;');

      resolver.bobClient.resolveConflict = jest.fn()
        .mockResolvedValueOnce({
          suggestedCode: 'const x = 1;',
          confidence: 0.95,
          approach: 'accept-ours',
          reasoning: 'High confidence',
        })
        .mockResolvedValueOnce({
          suggestedCode: 'const x = 2;',
          confidence: 0.88,
          approach: 'accept-theirs',
          reasoning: 'High confidence',
        })
        .mockResolvedValueOnce({
          suggestedCode: 'const x = 3;',
          confidence: 0.92,
          approach: 'accept-both',
          reasoning: 'High confidence',
        });

      const result = await resolver.resolveConflicts(
        conflicts,
        'feature/test',
        'main',
        { intent: 'Test' }
      );

      const summary = resolver.generateSummary(result);

      expect(summary.highConfidenceCount).toBe(3);
      expect(summary.avgConfidence).toBeGreaterThan(85);
      expect(summary.recommendedAction).toBe('apply-all-suggestions');
    });
  });

  describe('Validation Integration', () => {
    it('should validate resolutions before generating patches', async () => {
      const conflict = {
        file: 'test.js',
        type: 'content',
        complexity: 0.5,
      };

      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn()
        .mockResolvedValueOnce('const x = 0;') // base
        .mockResolvedValueOnce('const x = 1;') // feature
        .mockResolvedValueOnce('const x = 2;'); // target

      // Test with conflict markers (should fail validation)
      resolver.bobClient.resolveConflict = jest.fn().mockResolvedValue({
        suggestedCode: '<<<<<<< HEAD\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> main',
        confidence: 0.85,
        approach: 'accept-both',
        reasoning: 'Invalid resolution',
      });

      const result = await resolver.resolveConflict(
        conflict,
        'feature/test',
        'main',
        { intent: 'Test' }
      );

      expect(result.success).toBe(false);
      expect(result.validation.valid).toBe(false);
      expect(result.validation.issues).toContain('Resolution still contains conflict markers');
    });
  });

  describe('Performance: Parallel Processing', () => {
    it('should handle multiple conflicts efficiently', async () => {
      const conflicts = Array(5).fill(null).map((_, i) => ({
        file: `file${i}.js`,
        type: 'content',
        complexity: 0.3,
      }));

      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn().mockResolvedValue('const x = 0;');

      resolver.bobClient.resolveConflict = jest.fn().mockResolvedValue({
        suggestedCode: 'const x = 3;',
        confidence: 0.85,
        approach: 'accept-both',
        reasoning: 'Merged',
      });

      const startTime = Date.now();
      const result = await resolver.resolveConflicts(
        conflicts,
        'feature/test',
        'main',
        { intent: 'Test' }
      );
      const duration = Date.now() - startTime;

      expect(result.resolved).toBe(5);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});

// Made with Bob
