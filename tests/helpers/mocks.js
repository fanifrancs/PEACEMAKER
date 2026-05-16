// Mock helpers for testing

/**
 * Mock IBM Bob API client
 */
class MockBobClient {
  constructor() {
    this.responses = new Map();
  }

  setResponse(method, response) {
    this.responses.set(method, response);
  }

  async analyzeConflict(conflictData) {
    return this.responses.get('analyzeConflict') || {
      resolution: 'accept-both',
      confidence: 0.85,
      reasoning: 'Mock reasoning',
    };
  }

  async reconcileImports(importData) {
    return this.responses.get('reconcileImports') || {
      fixes: [],
      confidence: 0.9,
    };
  }

  async validateSyntax(code) {
    return this.responses.get('validateSyntax') || {
      valid: true,
      errors: [],
    };
  }

  async checkDependencies(deps) {
    return this.responses.get('checkDependencies') || {
      conflicts: [],
      suggestions: [],
    };
  }
}

/**
 * Mock Git operations
 */
class MockGitOperations {
  constructor() {
    this.mockData = {
      currentBranch: 'feature/test',
      branches: ['main', 'feature/test'],
      commits: [],
      conflicts: [],
      status: { files: [] },
    };
  }

  setMockData(data) {
    this.mockData = { ...this.mockData, ...data };
  }

  async getCurrentBranch() {
    return this.mockData.currentBranch;
  }

  async getBranches() {
    return this.mockData.branches;
  }

  async getCommits(branch) {
    return this.mockData.commits;
  }

  async simulateMerge(source, target) {
    return {
      conflicts: this.mockData.conflicts,
      hasConflicts: this.mockData.conflicts.length > 0,
    };
  }

  async getStatus() {
    return this.mockData.status;
  }

  async getMergeBase(branch1, branch2) {
    return 'abc123def456';
  }
}

/**
 * Create mock conflict data
 */
function createMockConflict(overrides = {}) {
  return {
    file: 'src/test.js',
    type: 'content',
    ours: 'const x = 1;',
    theirs: 'const x = 2;',
    base: 'const x = 0;',
    ...overrides,
  };
}

/**
 * Create mock analysis result
 */
function createMockAnalysis(overrides = {}) {
  return {
    sourceBranch: 'feature/test',
    targetBranch: 'main',
    divergencePoint: 'abc123',
    commitsAhead: 5,
    commitsBehind: 3,
    changedFiles: ['src/test.js'],
    conflicts: [],
    tier: 1,
    complexity: 'low',
    ...overrides,
  };
}

/**
 * Create mock guidance result
 */
function createMockGuidance(overrides = {}) {
  return {
    intent: 'Update test functionality',
    conflicts: [],
    imports: [],
    dependencies: [],
    syntax: { valid: true, errors: [] },
    structural: [],
    ...overrides,
  };
}

/**
 * Create mock patch
 */
function createMockPatch(overrides = {}) {
  return {
    file: 'src/test.js',
    type: 'conflict-resolution',
    original: 'const x = 1;',
    modified: 'const x = 2;',
    confidence: 0.85,
    reasoning: 'Mock reasoning',
    ...overrides,
  };
}

module.exports = {
  MockBobClient,
  MockGitOperations,
  createMockConflict,
  createMockAnalysis,
  createMockGuidance,
  createMockPatch,
};

// Made with Bob
