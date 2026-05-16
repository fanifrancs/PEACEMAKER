const ConflictResolver = require('./conflict-resolver');
const { MockBobClient, MockGitOperations, createMockConflict } = require('../../tests/helpers/mocks');

// Mock dependencies
jest.mock('./ibm-bob-client');
jest.mock('../utils/logger');

describe('ConflictResolver', () => {
  let resolver;
  let mockGitOps;
  let mockBobClient;

  beforeEach(() => {
    mockGitOps = new MockGitOperations();
    resolver = new ConflictResolver(mockGitOps);
    mockBobClient = resolver.bobClient;
  });

  describe('resolveConflicts', () => {
    it('should resolve multiple conflicts successfully', async () => {
      const conflicts = [
        createMockConflict({ file: 'file1.js' }),
        createMockConflict({ file: 'file2.js' }),
      ];

      mockBobClient.resolveConflict = jest.fn().mockResolvedValue({
        suggestedCode: 'const x = 3;',
        reasoning: 'Merged both changes',
        confidence: 0.85,
        approach: 'accept-both',
      });

      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn().mockResolvedValue('const x = 0;');

      const result = await resolver.resolveConflicts(
        conflicts,
        'feature/test',
        'main',
        { intent: 'Update values' },
      );

      expect(result.total).toBe(2);
      expect(result.resolved).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.resolutions).toHaveLength(2);
    });

    it('should handle failed resolutions gracefully', async () => {
      const conflicts = [
        createMockConflict({ file: 'file1.js' }),
        createMockConflict({ file: 'file2.js' }),
      ];

      mockBobClient.resolveConflict = jest.fn()
        .mockResolvedValueOnce({
          suggestedCode: 'const x = 3;',
          reasoning: 'Merged',
          confidence: 0.85,
          approach: 'accept-both',
        })
        .mockRejectedValueOnce(new Error('AI service unavailable'));

      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn().mockResolvedValue('const x = 0;');

      const result = await resolver.resolveConflicts(
        conflicts,
        'feature/test',
        'main',
        { intent: 'Update values' },
      );

      expect(result.total).toBe(2);
      expect(result.resolved).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle empty conflicts array', async () => {
      const result = await resolver.resolveConflicts([], 'feature/test', 'main', null);

      expect(result.total).toBe(0);
      expect(result.resolved).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.resolutions).toHaveLength(0);
    });
  });

  describe('resolveConflict', () => {
    beforeEach(() => {
      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn()
        .mockResolvedValueOnce('const x = 0;') // base
        .mockResolvedValueOnce('const x = 1;') // feature
        .mockResolvedValueOnce('const x = 2;'); // target

      mockBobClient.resolveConflict = jest.fn().mockResolvedValue({
        suggestedCode: 'const x = 3;',
        reasoning: 'Combined both changes',
        confidence: 0.85,
        approach: 'accept-both',
      });
    });

    it('should resolve a single conflict successfully', async () => {
      const conflict = createMockConflict();

      const result = await resolver.resolveConflict(
        conflict,
        'feature/test',
        'main',
        { intent: 'Update value' },
      );

      expect(result.success).toBe(true);
      expect(result.file).toBe('src/test.js');
      expect(result.resolution.suggestedCode).toBe('const x = 3;');
      expect(result.resolution.confidence).toBe(0.85);
    });

    it('should include conflict type in resolution', async () => {
      const conflict = createMockConflict();

      const result = await resolver.resolveConflict(
        conflict,
        'feature/test',
        'main',
        { intent: 'Update value' },
      );

      expect(result.conflictType).toBeDefined();
      expect(['content-conflict', 'structural-change', 'added-in-both', 'deleted-in-feature', 'deleted-in-target', 'unknown'])
        .toContain(result.conflictType);
    });

    it('should include validation results', async () => {
      const conflict = createMockConflict();

      const result = await resolver.resolveConflict(
        conflict,
        'feature/test',
        'main',
        { intent: 'Update value' },
      );

      expect(result.validation).toBeDefined();
      expect(result.validation.valid).toBeDefined();
      expect(result.validation.issues).toBeDefined();
    });
  });

  describe('getFileVersions', () => {
    it('should retrieve all three versions of a file', async () => {
      mockGitOps.detectForkPoint = jest.fn().mockResolvedValue({ hash: 'abc123' });
      mockGitOps.getFileContent = jest.fn()
        .mockResolvedValueOnce('base content')
        .mockResolvedValueOnce('feature content')
        .mockResolvedValueOnce('target content');

      const versions = await resolver.getFileVersions('test.js', 'feature', 'main');

      expect(versions.base).toBe('base content');
      expect(versions.feature).toBe('feature content');
      expect(versions.target).toBe('target content');
    });

    it('should handle missing files gracefully', async () => {
      mockGitOps.detectForkPoint = jest.fn().mockRejectedValue(new Error('File not found'));

      const versions = await resolver.getFileVersions('missing.js', 'feature', 'main');

      expect(versions.base).toBeNull();
      expect(versions.feature).toBeNull();
      expect(versions.target).toBeNull();
    });
  });

  describe('getSurroundingContext', () => {
    it('should return full content for small files', async () => {
      const content = 'line1\nline2\nline3';
      const context = await resolver.getSurroundingContext('test.js', 'feature', content);

      expect(context).toBe(content);
    });

    it('should truncate large files with context', async () => {
      const lines = Array(100).fill('line').map((l, i) => `${l}${i}`);
      const content = lines.join('\n');

      const context = await resolver.getSurroundingContext('test.js', 'feature', content);

      expect(context).toContain('line0');
      expect(context).toContain('line99');
      expect(context).toContain('lines omitted');
    });

    it('should handle null content', async () => {
      const context = await resolver.getSurroundingContext('test.js', 'feature', null);
      expect(context).toBe('');
    });
  });

  describe('determineConflictType', () => {
    it('should detect deleted-in-feature', () => {
      const versions = {
        base: 'content',
        feature: null,
        target: 'content',
      };

      const type = resolver.determineConflictType(versions);
      expect(type).toBe('deleted-in-feature');
    });

    it('should detect deleted-in-target', () => {
      const versions = {
        base: 'content',
        feature: 'content',
        target: null,
      };

      const type = resolver.determineConflictType(versions);
      expect(type).toBe('deleted-in-target');
    });

    it('should detect added-in-both', () => {
      const versions = {
        base: null,
        feature: 'feature content',
        target: 'target content',
      };

      const type = resolver.determineConflictType(versions);
      expect(type).toBe('added-in-both');
    });

    it('should detect content-conflict', () => {
      const versions = {
        base: 'line1\nline2\nline3',
        feature: 'line1\nline2 modified\nline3',
        target: 'line1\nline2 different\nline3',
      };

      const type = resolver.determineConflictType(versions);
      expect(type).toBe('content-conflict');
    });

    it('should detect structural-change', () => {
      const baseLines = Array(10).fill('line').join('\n');
      const featureLines = Array(20).fill('line').join('\n'); // 100% increase

      const versions = {
        base: baseLines,
        feature: featureLines,
        target: baseLines,
      };

      const type = resolver.determineConflictType(versions);
      expect(type).toBe('structural-change');
    });

    it('should return unknown for unrecognized patterns', () => {
      const versions = {
        base: null,
        feature: null,
        target: null,
      };

      const type = resolver.determineConflictType(versions);
      expect(type).toBe('unknown');
    });
  });

  describe('validateResolution', () => {
    const versions = {
      base: 'const x = 0;',
      feature: 'const x = 1;',
      target: 'const x = 2;',
    };

    it('should validate good resolution', () => {
      const resolution = {
        suggestedCode: 'const x = 3;',
        confidence: 0.85,
      };

      const validation = resolver.validateResolution(resolution, versions);

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should reject resolution without code', () => {
      const resolution = {
        suggestedCode: null,
        confidence: 0.85,
      };

      const validation = resolver.validateResolution(resolution, versions);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('No resolution code provided');
    });

    it('should warn about low confidence', () => {
      const resolution = {
        suggestedCode: 'const x = 3;',
        confidence: 0.3,
      };

      const validation = resolver.validateResolution(resolution, versions);

      expect(validation.issues).toContain('Low confidence resolution (< 50%)');
    });

    it('should reject resolution with conflict markers', () => {
      const resolution = {
        suggestedCode: '<<<<<<< HEAD\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> main',
        confidence: 0.85,
      };

      const validation = resolver.validateResolution(resolution, versions);

      expect(validation.valid).toBe(false);
      expect(validation.issues).toContain('Resolution still contains conflict markers');
    });

    it('should warn about significantly different resolution', () => {
      const resolution = {
        suggestedCode: 'completely different code that shares nothing',
        confidence: 0.85,
      };

      const validation = resolver.validateResolution(resolution, versions);

      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('hasConflictMarkers', () => {
    it('should detect conflict markers', () => {
      expect(resolver.hasConflictMarkers('<<<<<<< HEAD')).toBe(true);
      expect(resolver.hasConflictMarkers('=======')).toBe(true);
      expect(resolver.hasConflictMarkers('>>>>>>> main')).toBe(true);
    });

    it('should not detect false positives', () => {
      expect(resolver.hasConflictMarkers('const x = 1;')).toBe(false);
      expect(resolver.hasConflictMarkers('// Comment with < and >')).toBe(false);
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate high similarity for similar code', () => {
      const resolution = 'const x = 1;\nconst y = 2;';
      const feature = 'const x = 1;\nconst y = 3;';
      const target = 'const x = 2;\nconst y = 2;';

      const similarity = resolver.calculateSimilarity(resolution, feature, target);

      expect(similarity).toBeGreaterThan(0.5);
    });

    it('should calculate low similarity for different code', () => {
      const resolution = 'completely different code';
      const feature = 'const x = 1;';
      const target = 'const y = 2;';

      const similarity = resolver.calculateSimilarity(resolution, feature, target);

      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle empty resolution', () => {
      const similarity = resolver.calculateSimilarity('', 'const x = 1;', 'const y = 2;');
      expect(similarity).toBe(0);
    });
  });

  describe('createFailedResolution', () => {
    it('should create proper failed resolution object', () => {
      const conflict = createMockConflict();
      const error = new Error('Test error');

      const failed = resolver.createFailedResolution(conflict, error);

      expect(failed.success).toBe(false);
      expect(failed.file).toBe(conflict.file);
      expect(failed.validation.valid).toBe(false);
      expect(failed.error).toBe('Test error');
    });
  });

  describe('generateSummary', () => {
    it('should generate summary for successful resolutions', () => {
      const resolutionResult = {
        total: 3,
        resolved: 3,
        failed: 0,
        resolutions: [
          {
            success: true,
            resolution: { confidence: 0.9, approach: 'accept-both' },
          },
          {
            success: true,
            resolution: { confidence: 0.8, approach: 'accept-ours' },
          },
          {
            success: true,
            resolution: { confidence: 0.85, approach: 'accept-both' },
          },
        ],
      };

      const summary = resolver.generateSummary(resolutionResult);

      expect(summary.total).toBe(3);
      expect(summary.resolved).toBe(3);
      expect(summary.avgConfidence).toBeGreaterThan(80);
      expect(summary.approaches['accept-both']).toBe(2);
      expect(summary.highConfidenceCount).toBe(3);
    });

    it('should handle mixed success/failure', () => {
      const resolutionResult = {
        total: 3,
        resolved: 2,
        failed: 1,
        resolutions: [
          {
            success: true,
            resolution: { confidence: 0.9, approach: 'accept-both' },
          },
          {
            success: true,
            resolution: { confidence: 0.7, approach: 'accept-ours' },
          },
          {
            success: false,
            resolution: null,
          },
        ],
      };

      const summary = resolver.generateSummary(resolutionResult);

      expect(summary.total).toBe(3);
      expect(summary.resolved).toBe(2);
      expect(summary.failed).toBe(1);
    });
  });

  describe('getRecommendedAction', () => {
    it('should recommend manual review when no resolutions', () => {
      const result = {
        total: 2,
        resolved: 0,
        resolutions: [],
      };

      const action = resolver.getRecommendedAction(result);
      expect(action).toBe('manual-review-required');
    });

    it('should recommend apply-all for high confidence complete resolutions', () => {
      const result = {
        total: 2,
        resolved: 2,
        resolutions: [
          { success: true, resolution: { confidence: 0.9 } },
          { success: true, resolution: { confidence: 0.85 } },
        ],
      };

      const action = resolver.getRecommendedAction(result);
      expect(action).toBe('apply-all-suggestions');
    });

    it('should recommend review-and-apply for medium confidence', () => {
      const result = {
        total: 2,
        resolved: 2,
        resolutions: [
          { success: true, resolution: { confidence: 0.7 } },
          { success: true, resolution: { confidence: 0.65 } },
        ],
      };

      const action = resolver.getRecommendedAction(result);
      expect(action).toBe('review-and-apply');
    });

    it('should recommend careful review for low confidence', () => {
      const result = {
        total: 2,
        resolved: 2,
        resolutions: [
          { success: true, resolution: { confidence: 0.5 } },
          { success: true, resolution: { confidence: 0.4 } },
        ],
      };

      const action = resolver.getRecommendedAction(result);
      expect(action).toBe('careful-review-required');
    });
  });
});

// Made with Bob
