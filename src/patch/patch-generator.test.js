const PatchGenerator = require('./patch-generator');
const { MockGitOperations, createMockPatch } = require('../../tests/helpers/mocks');
const fs = require('fs').promises;

jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
  },
}));

describe('PatchGenerator', () => {
  let generator;
  let mockGitOps;

  beforeEach(() => {
    mockGitOps = new MockGitOperations();
    generator = new PatchGenerator(mockGitOps);
    jest.clearAllMocks();
  });

  describe('generatePatches', () => {
    it('should generate patches from approved suggestions', async () => {
      const suggestions = [
        {
          type: 'conflict-resolution',
          file: 'test.js',
          resolution: {
            suggestedCode: 'const x = 3;',
            confidence: 0.85,
            approach: 'accept-both',
            reasoning: 'Merged both changes',
          },
          conflictType: 'content-conflict',
        },
        {
          type: 'import-fix',
          file: 'app.js',
          oldPath: '../utils/helper',
          newPath: '../../utils/helper',
          line: 5,
          confidence: 0.9,
        },
      ];

      mockGitOps.readFile = jest.fn()
        .mockResolvedValueOnce('<<<<<<< HEAD\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> main')
        .mockResolvedValueOnce('import helper from "../utils/helper";\n');

      const patches = await generator.generatePatches(suggestions);

      expect(patches.conflicts).toHaveLength(1);
      expect(patches.imports).toHaveLength(1);
      expect(patches.metadata.generatedPatches).toBe(2);
    });

    it('should handle empty suggestions array', async () => {
      const patches = await generator.generatePatches([]);

      expect(patches.conflicts).toHaveLength(0);
      expect(patches.imports).toHaveLength(0);
      expect(patches.dependencies).toHaveLength(0);
      expect(patches.metadata.generatedPatches).toBe(0);
    });

    it('should skip unknown suggestion types', async () => {
      const suggestions = [
        {
          type: 'unknown-type',
          file: 'test.js',
        },
      ];

      const patches = await generator.generatePatches(suggestions);

      expect(patches.metadata.generatedPatches).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      const suggestions = [
        {
          type: 'conflict-resolution',
          file: 'test.js',
          resolution: {
            suggestedCode: 'const x = 3;',
            confidence: 0.85,
          },
        },
      ];

      mockGitOps.readFile = jest.fn().mockRejectedValue(new Error('File not found'));

      const patches = await generator.generatePatches(suggestions);

      expect(patches.metadata.generatedPatches).toBe(0);
    });
  });

  describe('generateConflictPatch', () => {
    it('should generate patch for conflict resolution', async () => {
      const suggestion = {
        file: 'test.js',
        resolution: {
          suggestedCode: 'const x = 3;',
          confidence: 0.85,
          approach: 'accept-both',
          reasoning: 'Merged both changes',
        },
        conflictType: 'content-conflict',
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue(
        '<<<<<<< HEAD\nconst x = 1;\n=======\nconst x = 2;\n>>>>>>> main'
      );

      const patch = await generator.generateConflictPatch(suggestion);

      expect(patch).toBeDefined();
      expect(patch.file).toBe('test.js');
      expect(patch.type).toBe('conflict-resolution');
      expect(patch.confidence).toBe(0.85);
      expect(patch.patch).toContain('---');
      expect(patch.patch).toContain('+++');
    });

    it('should return null if no resolution provided', async () => {
      const suggestion = {
        file: 'test.js',
        resolution: null,
      };

      const patch = await generator.generateConflictPatch(suggestion);
      expect(patch).toBeNull();
    });

    it('should return null if no conflict markers found', async () => {
      const suggestion = {
        file: 'test.js',
        resolution: {
          suggestedCode: 'const x = 3;',
          confidence: 0.85,
        },
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue('const x = 1;');

      const patch = await generator.generateConflictPatch(suggestion);
      expect(patch).toBeNull();
    });
  });

  describe('generateImportPatch', () => {
    it('should generate patch for import fix', async () => {
      const suggestion = {
        file: 'app.js',
        oldPath: '../utils/helper',
        newPath: '../../utils/helper',
        line: 1,
        confidence: 0.9,
        importType: 'relative',
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue(
        'import helper from "../utils/helper";\n'
      );

      const patch = await generator.generateImportPatch(suggestion);

      expect(patch).toBeDefined();
      expect(patch.file).toBe('app.js');
      expect(patch.type).toBe('import-fix');
      expect(patch.confidence).toBe(0.9);
      expect(patch.metadata.oldPath).toBe('../utils/helper');
      expect(patch.metadata.newPath).toBe('../../utils/helper');
    });

    it('should return null for invalid line number', async () => {
      const suggestion = {
        file: 'app.js',
        oldPath: '../utils/helper',
        newPath: '../../utils/helper',
        line: 100,
        confidence: 0.9,
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue('import helper from "../utils/helper";\n');

      const patch = await generator.generateImportPatch(suggestion);
      expect(patch).toBeNull();
    });
  });

  describe('generateDependencyPatch', () => {
    it('should generate patch for dependency update', async () => {
      const suggestion = {
        file: 'package.json',
        package: 'react',
        sourceVersion: '^17.0.0',
        targetVersion: '^18.0.0',
        suggestion: '^18.2.0',
        confidence: 0.85,
        reasoning: 'Use latest stable version',
      };

      const packageJson = {
        dependencies: {
          react: '^17.0.0',
        },
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue(JSON.stringify(packageJson, null, 2));

      const patch = await generator.generateDependencyPatch(suggestion);

      expect(patch).toBeDefined();
      expect(patch.file).toBe('package.json');
      expect(patch.type).toBe('dependency-update');
      expect(patch.metadata.package).toBe('react');
      expect(patch.metadata.newVersion).toBe('^18.2.0');
    });

    it('should handle devDependencies', async () => {
      const suggestion = {
        file: 'package.json',
        package: 'jest',
        sourceVersion: '^28.0.0',
        targetVersion: '^29.0.0',
        suggestion: '^29.5.0',
        confidence: 0.85,
      };

      const packageJson = {
        devDependencies: {
          jest: '^28.0.0',
        },
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue(JSON.stringify(packageJson, null, 2));

      const patch = await generator.generateDependencyPatch(suggestion);

      expect(patch).toBeDefined();
      expect(patch.metadata.package).toBe('jest');
    });

    it('should return null if package not found', async () => {
      const suggestion = {
        file: 'package.json',
        package: 'nonexistent',
        suggestion: '^1.0.0',
        confidence: 0.85,
      };

      const packageJson = {
        dependencies: {
          react: '^17.0.0',
        },
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue(JSON.stringify(packageJson, null, 2));

      const patch = await generator.generateDependencyPatch(suggestion);
      expect(patch).toBeNull();
    });
  });

  describe('findConflictMarkers', () => {
    it('should find conflict markers', () => {
      const lines = [
        'const a = 1;',
        '<<<<<<< HEAD',
        'const x = 1;',
        '=======',
        'const x = 2;',
        '>>>>>>> main',
        'const b = 2;',
      ];

      const markers = generator.findConflictMarkers(lines);

      expect(markers).toBeDefined();
      expect(markers.start).toBe(1);
      expect(markers.separator).toBe(3);
      expect(markers.end).toBe(5);
    });

    it('should return null if no markers found', () => {
      const lines = ['const x = 1;', 'const y = 2;'];

      const markers = generator.findConflictMarkers(lines);
      expect(markers).toBeNull();
    });

    it('should return null for incomplete markers', () => {
      const lines = [
        '<<<<<<< HEAD',
        'const x = 1;',
        // Missing separator and end
      ];

      const markers = generator.findConflictMarkers(lines);
      expect(markers).toBeNull();
    });
  });

  describe('createUnifiedDiff', () => {
    it('should create unified diff format', () => {
      const file = 'test.js';
      const lines = [
        'const a = 1;',
        '<<<<<<< HEAD',
        'const x = 1;',
        '=======',
        'const x = 2;',
        '>>>>>>> main',
        'const b = 2;',
      ];
      const markers = { start: 1, separator: 3, end: 5 };
      const suggestedCode = 'const x = 3;';

      const diff = generator.createUnifiedDiff(file, lines, markers, suggestedCode);

      expect(diff).toContain('--- a/test.js');
      expect(diff).toContain('+++ b/test.js');
      expect(diff).toContain('@@');
      expect(diff).toContain('-<<<<<<< HEAD');
      expect(diff).toContain('+const x = 3;');
    });
  });

  describe('createSimpleDiff', () => {
    it('should create simple line replacement diff', () => {
      const diff = generator.createSimpleDiff(
        'app.js',
        5,
        'import helper from "../utils/helper";',
        'import helper from "../../utils/helper";'
      );

      expect(diff).toContain('--- a/app.js');
      expect(diff).toContain('+++ b/app.js');
      expect(diff).toContain('@@ -5,1 +5,1 @@');
      expect(diff).toContain('-import helper from "../utils/helper";');
      expect(diff).toContain('+import helper from "../../utils/helper";');
    });
  });

  describe('createFileDiff', () => {
    it('should create full file diff', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nline2 modified\nline3';

      const diff = generator.createFileDiff('test.js', oldContent, newContent);

      expect(diff).toContain('--- a/test.js');
      expect(diff).toContain('+++ b/test.js');
      expect(diff).toContain('-line2');
      expect(diff).toContain('+line2 modified');
      expect(diff).toContain(' line1');
      expect(diff).toContain(' line3');
    });

    it('should handle added lines', () => {
      const oldContent = 'line1\nline2';
      const newContent = 'line1\nline2\nline3';

      const diff = generator.createFileDiff('test.js', oldContent, newContent);

      expect(diff).toContain('+line3');
    });

    it('should handle removed lines', () => {
      const oldContent = 'line1\nline2\nline3';
      const newContent = 'line1\nline2';

      const diff = generator.createFileDiff('test.js', oldContent, newContent);

      expect(diff).toContain('-line3');
    });
  });

  describe('savePatchesToFile', () => {
    it('should save patches to file', async () => {
      const patches = {
        conflicts: [
          {
            file: 'test.js',
            confidence: 0.85,
            approach: 'accept-both',
            patch: '--- a/test.js\n+++ b/test.js',
            metadata: {
              reasoning: 'Test reasoning',
            },
          },
        ],
        imports: [],
        dependencies: [],
        metadata: {
          timestamp: '2024-01-01T00:00:00.000Z',
          totalSuggestions: 1,
          generatedPatches: 1,
        },
      };

      await generator.savePatchesToFile(patches, 'output.md');

      expect(fs.writeFile).toHaveBeenCalledWith(
        'output.md',
        expect.stringContaining('# PEACEMAKER Generated Patches'),
        'utf8'
      );
    });
  });

  describe('formatPatchesForFile', () => {
    it('should format patches with all types', () => {
      const patches = {
        conflicts: [
          {
            file: 'test.js',
            confidence: 0.85,
            approach: 'accept-both',
            patch: '--- a/test.js\n+++ b/test.js',
            metadata: {
              reasoning: 'Merged changes',
            },
          },
        ],
        imports: [
          {
            file: 'app.js',
            confidence: 0.9,
            patch: '--- a/app.js\n+++ b/app.js',
            metadata: {
              oldPath: '../utils',
              newPath: '../../utils',
            },
          },
        ],
        dependencies: [
          {
            file: 'package.json',
            confidence: 0.8,
            patch: '--- a/package.json\n+++ b/package.json',
            metadata: {
              package: 'react',
              oldVersion: '^17.0.0',
              newVersion: '^18.0.0',
            },
          },
        ],
        metadata: {
          timestamp: '2024-01-01T00:00:00.000Z',
          totalSuggestions: 3,
          generatedPatches: 3,
        },
      };

      const formatted = generator.formatPatchesForFile(patches);

      expect(formatted).toContain('# PEACEMAKER Generated Patches');
      expect(formatted).toContain('## Conflict Resolution Patches');
      expect(formatted).toContain('## Import Fix Patches');
      expect(formatted).toContain('## Dependency Update Patches');
      expect(formatted).toContain('Confidence: 85%');
      expect(formatted).toContain('Confidence: 90%');
      expect(formatted).toContain('Confidence: 80%');
    });

    it('should handle empty patches', () => {
      const patches = {
        conflicts: [],
        imports: [],
        dependencies: [],
        metadata: {
          timestamp: '2024-01-01T00:00:00.000Z',
          totalSuggestions: 0,
          generatedPatches: 0,
        },
      };

      const formatted = generator.formatPatchesForFile(patches);

      expect(formatted).toContain('# PEACEMAKER Generated Patches');
      expect(formatted).not.toContain('## Conflict Resolution Patches');
      expect(formatted).not.toContain('## Import Fix Patches');
      expect(formatted).not.toContain('## Dependency Update Patches');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed conflict markers', async () => {
      const suggestion = {
        file: 'test.js',
        resolution: {
          suggestedCode: 'const x = 3;',
          confidence: 0.85,
        },
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue(
        '<<<<<<< HEAD\nconst x = 1;\n=======\n' // Missing end marker
      );

      const patch = await generator.generateConflictPatch(suggestion);
      expect(patch).toBeNull();
    });

    it('should handle empty file content', async () => {
      const suggestion = {
        file: 'empty.js',
        oldPath: '../utils',
        newPath: '../../utils',
        line: 1,
        confidence: 0.9,
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue('');

      const patch = await generator.generateImportPatch(suggestion);
      expect(patch).toBeNull();
    });

    it('should handle invalid JSON in package.json', async () => {
      const suggestion = {
        file: 'package.json',
        package: 'react',
        suggestion: '^18.0.0',
        confidence: 0.85,
      };

      mockGitOps.readFile = jest.fn().mockResolvedValue('invalid json');

      await expect(generator.generateDependencyPatch(suggestion)).rejects.toThrow();
    });
  });
});

// Made with Bob
