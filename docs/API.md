# PEACEMAKER API Documentation

Complete API reference for PEACEMAKER modules and classes.

## Table of Contents

- [Git Operations](#git-operations)
- [AI Services](#ai-services)
- [Validation](#validation)
- [Patch System](#patch-system)
- [Core Modules](#core-modules)
- [Utilities](#utilities)

---

## Git Operations

### GitOperations

Git command wrapper with simple-git integration.

**Location:** `src/git/operations.js`

#### Constructor

```javascript
const GitOperations = require('./src/git/operations');
const gitOps = new GitOperations();
```

#### Methods

##### `isGitRepository()`

Check if current directory is a git repository.

**Returns:** `Promise<boolean>`

```javascript
const isRepo = await gitOps.isGitRepository();
```

##### `getCurrentBranch()`

Get the name of the current branch.

**Returns:** `Promise<string>`

```javascript
const branch = await gitOps.getCurrentBranch();
// Returns: "main" or "feature/new-feature"
```

##### `detectForkPoint(sourceBranch, targetBranch)`

Find the merge-base (fork point) between two branches.

**Parameters:**
- `sourceBranch` (string): Source branch name
- `targetBranch` (string): Target branch name

**Returns:** `Promise<string>` - Commit SHA of fork point

```javascript
const forkPoint = await gitOps.detectForkPoint('feature', 'main');
// Returns: "abc123def456..."
```

##### `calculateDivergence(sourceBranch, targetBranch)`

Calculate how many commits each branch is ahead/behind.

**Parameters:**
- `sourceBranch` (string): Source branch name
- `targetBranch` (string): Target branch name

**Returns:** `Promise<Object>`

```javascript
const divergence = await gitOps.calculateDivergence('feature', 'main');
// Returns: { ahead: 5, behind: 3 }
```

##### `getChangedFiles(sourceBranch, targetBranch)`

Get list of files changed between branches.

**Parameters:**
- `sourceBranch` (string): Source branch name
- `targetBranch` (string): Target branch name

**Returns:** `Promise<Array<string>>`

```javascript
const files = await gitOps.getChangedFiles('feature', 'main');
// Returns: ['src/app.js', 'src/utils.js']
```

##### `simulateMerge(sourceBranch, targetBranch)`

Simulate a merge without committing.

**Parameters:**
- `sourceBranch` (string): Source branch name
- `targetBranch` (string): Target branch name

**Returns:** `Promise<Object>`

```javascript
const result = await gitOps.simulateMerge('feature', 'main');
// Returns: {
//   success: false,
//   conflicts: ['src/app.js'],
//   message: 'Merge conflict detected'
// }
```

##### `readFile(filePath)`

Read file content from working directory.

**Parameters:**
- `filePath` (string): Relative path to file

**Returns:** `Promise<string>`

```javascript
const content = await gitOps.readFile('src/app.js');
```

---

### ConflictAnalyzer

Analyzes merge conflicts and categorizes them.

**Location:** `src/git/analyzer.js`

#### Constructor

```javascript
const ConflictAnalyzer = require('./src/git/analyzer');
const analyzer = new ConflictAnalyzer(gitOps);
```

#### Methods

##### `analyzeConflicts(mergeResult, sourceBranch, targetBranch)`

Analyze conflicts from merge simulation.

**Parameters:**
- `mergeResult` (Object): Result from simulateMerge
- `sourceBranch` (string): Source branch name
- `targetBranch` (string): Target branch name

**Returns:** `Promise<Object>`

```javascript
const analysis = await analyzer.analyzeConflicts(mergeResult, 'feature', 'main');
// Returns: {
//   hasConflicts: true,
//   conflictCount: 2,
//   conflicts: [
//     {
//       file: 'src/app.js',
//       type: 'content',
//       severity: 'medium',
//       lines: { start: 10, end: 25 }
//     }
//   ]
// }
```

---

## AI Services

### IBMBobClient

Client for IBM Bob AI API with retry logic.

**Location:** `src/ai/ibm-bob-client.js`

#### Constructor

```javascript
const IBMBobClient = require('./src/ai/ibm-bob-client');
const client = new IBMBobClient();
```

#### Methods

##### `chat(messages, options)`

Send chat completion request.

**Parameters:**
- `messages` (Array): Array of message objects
- `options` (Object): Request options

**Returns:** `Promise<Object>`

```javascript
const response = await client.chat([
  { role: 'user', content: 'Analyze this conflict...' }
], {
  temperature: 0.7,
  maxTokens: 2000
});
```

---

### GuidanceOrchestrator

Orchestrates all AI guidance services.

**Location:** `src/ai/guidance-orchestrator.js`

#### Constructor

```javascript
const GuidanceOrchestrator = require('./src/ai/guidance-orchestrator');
const orchestrator = new GuidanceOrchestrator(gitOps);
```

#### Methods

##### `generateGuidance(analysis, options)`

Generate comprehensive AI guidance.

**Parameters:**
- `analysis` (Object): Analysis from ConflictAnalyzer
- `options` (Object): Generation options

**Returns:** `Promise<Object>`

```javascript
const guidance = await orchestrator.generateGuidance(analysis, {
  validateSyntax: true,
  validationLevel: 'basic'
});
// Returns: {
//   intent: 'Update API endpoints',
//   components: {
//     conflicts: { ... },
//     imports: { ... },
//     dependencies: { ... }
//   },
//   recommendedAction: { ... },
//   overallConfidence: 0.85
// }
```

---

### ConflictResolver

Resolves merge conflicts using AI.

**Location:** `src/ai/conflict-resolver.js`

#### Methods

##### `resolveConflicts(conflicts, context)`

Resolve conflicts with AI suggestions.

**Parameters:**
- `conflicts` (Array): List of conflicts
- `context` (Object): Additional context

**Returns:** `Promise<Object>`

```javascript
const resolutions = await resolver.resolveConflicts(conflicts, {
  sourceBranch: 'feature',
  targetBranch: 'main'
});
```

---

## Validation

### PreValidator

Pre-validation pipeline for syntax, imports, and dependencies.

**Location:** `src/validation/pre-validator.js`

#### Constructor

```javascript
const PreValidator = require('./src/validation/pre-validator');
const validator = new PreValidator(gitOps);
```

#### Methods

##### `validate(changedFiles, options)`

Run pre-validation on changed files.

**Parameters:**
- `changedFiles` (Array<string>): List of changed files
- `options` (Object): Validation options

**Returns:** `Promise<Object>`

```javascript
const results = await validator.validate(changedFiles, {
  validationLevel: 'basic',
  skipValidation: false
});
// Returns: {
//   passed: true,
//   duration: 1250,
//   validations: {
//     syntax: { passed: true, errors: [], warnings: [] },
//     imports: { passed: true, errors: [], warnings: [] },
//     types: { passed: true, errors: [], warnings: [] },
//     dependencies: { passed: true, errors: [], warnings: [] }
//   },
//   summary: {
//     totalFiles: 10,
//     filesChecked: 8,
//     errorsFound: 0,
//     warningsFound: 2
//   }
// }
```

---

## Patch System

### PatchGenerator

Generates patches from approved AI suggestions.

**Location:** `src/patch/patch-generator.js`

#### Constructor

```javascript
const PatchGenerator = require('./src/patch/patch-generator');
const generator = new PatchGenerator(gitOps);
```

#### Methods

##### `generatePatches(approvedSuggestions, options)`

Generate patches from suggestions.

**Parameters:**
- `approvedSuggestions` (Array): Approved suggestions
- `options` (Object): Generation options

**Returns:** `Promise<Object>`

```javascript
const patches = await generator.generatePatches(approved);
// Returns: {
//   conflicts: [...],
//   imports: [...],
//   dependencies: [...],
//   metadata: {
//     timestamp: '2026-05-16T...',
//     totalSuggestions: 5,
//     generatedPatches: 5
//   }
// }
```

---

### PatchApplicator

Applies generated patches to files.

**Location:** `src/patch/patch-applicator.js`

#### Constructor

```javascript
const PatchApplicator = require('./src/patch/patch-applicator');
const applicator = new PatchApplicator(gitOps);
```

#### Methods

##### `applyPatches(patches, options)`

Apply patches to files.

**Parameters:**
- `patches` (Object): Generated patches
- `options` (Object): Application options

**Returns:** `Promise<Object>`

```javascript
const results = await applicator.applyPatches(patches, {
  dryRun: false
});
// Returns: {
//   applied: [...],
//   failed: [...],
//   skipped: [...],
//   metadata: {
//     timestamp: '...',
//     totalPatches: 5,
//     successCount: 4,
//     failureCount: 1
//   }
// }
```

##### `createCommit(results, guidance, options)`

Create git commit for applied patches.

**Parameters:**
- `results` (Object): Application results
- `guidance` (Object): AI guidance
- `options` (Object): Commit options

**Returns:** `Promise<Object>`

```javascript
const commit = await applicator.createCommit(results, guidance, {
  dryRun: false
});
```

---

## Core Modules

### TierClassifier

Classifies merge complexity into tiers.

**Location:** `src/core/classifier.js`

#### Methods

##### `classify(divergence, changedFiles, conflictAnalysis)`

Classify merge into tier 1, 2, or 3.

**Parameters:**
- `divergence` (Object): Divergence metrics
- `changedFiles` (Array): Changed files
- `conflictAnalysis` (Object): Conflict analysis

**Returns:** `Object`

```javascript
const classification = classifier.classify(divergence, files, analysis);
// Returns: {
//   tier: 2,
//   reason: 'Moderate divergence with conflicts',
//   confidence: 0.85,
//   recommendation: 'Use AI guidance'
// }
```

---

## Utilities

### Logger

Logging utility with colored output.

**Location:** `src/utils/logger.js`

#### Methods

```javascript
const logger = require('./src/utils/logger');

logger.info('Information message');
logger.warn('Warning message');
logger.error('Error message');
logger.success('Success message');
logger.header('Section Header');
logger.section('Subsection');
```

---

### Spinner

Progress indicator utility.

**Location:** `src/utils/spinner.js`

#### Usage

```javascript
const Spinner = require('./src/utils/spinner');
const spinner = new Spinner();

spinner.start('Loading...');
// ... async operation
spinner.succeed('Complete');

// Or on failure
spinner.fail('Failed');
```

---

### Config

Configuration management.

**Location:** `src/utils/config.js`

#### Methods

```javascript
const config = require('./src/utils/config');

// Check if configured
const isConfigured = config.isConfigured();

// Get API key
const apiKey = config.getApiKey();

// Get API URL
const apiUrl = config.getApiUrl();
```

---

## Error Handling

All async methods may throw errors. Always use try-catch:

```javascript
try {
  const result = await gitOps.simulateMerge('feature', 'main');
} catch (error) {
  console.error('Merge simulation failed:', error.message);
  
  if (process.env.PEACEMAKER_LOG_LEVEL === 'debug') {
    console.error(error.stack);
  }
}
```

---

## Type Definitions

### Analysis Object

```typescript
interface Analysis {
  sourceBranch: string;
  targetBranch: string;
  forkPoint: string;
  divergence: {
    ahead: number;
    behind: number;
  };
  changedFiles: string[];
  mergeResult: {
    success: boolean;
    conflicts: string[];
    message: string;
  };
  conflictAnalysis: {
    hasConflicts: boolean;
    conflictCount: number;
    conflicts: Conflict[];
  };
  classification: {
    tier: number;
    reason: string;
    confidence: number;
    recommendation: string;
  };
}
```

### Guidance Object

```typescript
interface Guidance {
  intent: string;
  components: {
    conflicts: ConflictGuidance;
    imports: ImportGuidance;
    syntax: SyntaxGuidance;
    structural: StructuralGuidance;
    dependencies: DependencyGuidance;
  };
  recommendedAction: {
    action: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    reasoning: string;
  };
  overallConfidence: number;
}
```

---

## Examples

### Complete Workflow

```javascript
const GitOperations = require('./src/git/operations');
const ConflictAnalyzer = require('./src/git/analyzer');
const TierClassifier = require('./src/core/classifier');
const GuidanceOrchestrator = require('./src/ai/guidance-orchestrator');

async function analyzeAndResolve(sourceBranch, targetBranch) {
  // Initialize
  const gitOps = new GitOperations();
  const analyzer = new ConflictAnalyzer(gitOps);
  const classifier = new TierClassifier();
  const orchestrator = new GuidanceOrchestrator(gitOps);

  // Analyze
  const forkPoint = await gitOps.detectForkPoint(sourceBranch, targetBranch);
  const divergence = await gitOps.calculateDivergence(sourceBranch, targetBranch);
  const changedFiles = await gitOps.getChangedFiles(sourceBranch, targetBranch);
  const mergeResult = await gitOps.simulateMerge(sourceBranch, targetBranch);
  const conflictAnalysis = await analyzer.analyzeConflicts(mergeResult, sourceBranch, targetBranch);
  const classification = classifier.classify(divergence, changedFiles, conflictAnalysis);

  // Generate guidance if needed
  if (classification.tier === 2) {
    const guidance = await orchestrator.generateGuidance({
      sourceBranch,
      targetBranch,
      forkPoint,
      divergence,
      changedFiles,
      mergeResult,
      conflictAnalysis,
      classification
    });

    return guidance;
  }

  return { tier: classification.tier, recommendation: classification.recommendation };
}
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test
npm test -- src/core/classifier.test.js
```

### Test Structure

Tests are co-located with source files:

```
src/
├── core/
│   ├── classifier.js
│   └── classifier.test.js
├── ai/
│   ├── conflict-resolver.js
│   └── conflict-resolver.test.js
└── patch/
    ├── patch-generator.js
    └── patch-generator.test.js
```

### Writing Tests

```javascript
const Component = require('./component');
const { MockGitOperations } = require('../../tests/helpers/mocks');

describe('Component', () => {
  let component;
  let mockGitOps;

  beforeEach(() => {
    mockGitOps = new MockGitOperations();
    component = new Component(mockGitOps);
  });

  it('should perform expected behavior', async () => {
    const result = await component.method();
    expect(result).toBeDefined();
  });
});
```

For comprehensive testing guidelines, see [TESTING.md](TESTING.md).

---

For more examples, see the [examples](../examples/) directory.