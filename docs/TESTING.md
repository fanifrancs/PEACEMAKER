# Testing Guidelines

This document outlines the testing strategy, conventions, and best practices for the PEACEMAKER project.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Coverage](#test-coverage)
- [Mocking Strategy](#mocking-strategy)
- [Best Practices](#best-practices)

---

## Overview

PEACEMAKER uses **Jest** as its testing framework. Our testing strategy includes:

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test workflows and component interactions
- **Edge Case Tests**: Test boundary conditions and error scenarios

### Test Coverage Goals

- **Minimum Coverage**: 70% across all metrics (lines, branches, functions, statements)
- **Critical Components**: 90%+ coverage for AI components and core logic
- **Target**: 80%+ overall coverage

---

## Test Structure

```
PEACEMAKER/
├── src/
│   ├── ai/
│   │   ├── conflict-resolver.js
│   │   └── conflict-resolver.test.js    # Unit tests alongside source
│   ├── core/
│   │   ├── classifier.js
│   │   └── classifier.test.js
│   └── patch/
│       ├── patch-generator.js
│       └── patch-generator.test.js
├── tests/
│   ├── setup.js                          # Global test setup
│   ├── helpers/
│   │   └── mocks.js                      # Shared mock utilities
│   └── integration/
│       └── workflow.test.js              # Integration tests
└── jest.config.js                        # Jest configuration
```

### Naming Conventions

- **Unit test files**: `<component>.test.js` (co-located with source)
- **Integration test files**: `<feature>.test.js` (in `tests/integration/`)
- **Test suites**: Use descriptive `describe()` blocks
- **Test cases**: Use clear, action-oriented `it()` descriptions

---

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- src/core/classifier.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should classify"
```

### Coverage Reports

Coverage reports are generated in the `coverage/` directory:

- **HTML Report**: `coverage/lcov-report/index.html`
- **Text Summary**: Displayed in terminal
- **LCOV Format**: `coverage/lcov.info` (for CI integration)

---

## Writing Tests

### Unit Test Template

```javascript
const ComponentName = require('./component-name');
const { MockDependency } = require('../../tests/helpers/mocks');

// Mock external dependencies
jest.mock('./external-dependency');
jest.mock('../utils/logger');

describe('ComponentName', () => {
  let component;
  let mockDependency;

  beforeEach(() => {
    mockDependency = new MockDependency();
    component = new ComponentName(mockDependency);
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should perform expected action', () => {
      // Arrange
      const input = 'test input';
      const expected = 'expected output';

      // Act
      const result = component.methodName(input);

      // Assert
      expect(result).toBe(expected);
    });

    it('should handle error cases', () => {
      // Arrange
      const invalidInput = null;

      // Act & Assert
      expect(() => component.methodName(invalidInput)).toThrow();
    });
  });
});
```

### Integration Test Template

```javascript
describe('Integration: Feature Workflow', () => {
  let componentA;
  let componentB;
  let mockGitOps;

  beforeEach(() => {
    mockGitOps = new MockGitOperations();
    componentA = new ComponentA(mockGitOps);
    componentB = new ComponentB(mockGitOps);
  });

  it('should complete end-to-end workflow', async () => {
    // Arrange
    const input = setupTestData();

    // Act
    const resultA = await componentA.process(input);
    const resultB = await componentB.process(resultA);

    // Assert
    expect(resultB.success).toBe(true);
    expect(resultB.data).toBeDefined();
  });
});
```

---

## Test Coverage

### What to Test

#### ✅ Always Test

- **Public methods**: All exported functions and class methods
- **Business logic**: Core algorithms and decision-making code
- **Error handling**: Exception cases and error recovery
- **Edge cases**: Boundary conditions, empty inputs, null values
- **Integration points**: Component interactions and data flow

#### ⚠️ Consider Testing

- **Private methods**: If they contain complex logic
- **Utility functions**: If they're reused across components
- **Configuration**: If it affects behavior significantly

#### ❌ Don't Test

- **Third-party libraries**: Trust their own tests
- **Simple getters/setters**: Unless they have logic
- **Trivial code**: One-line pass-throughs
- **Generated code**: Auto-generated files

### Coverage Thresholds

Configured in `jest.config.js`:

```javascript
coverageThresholds: {
  global: {
    branches: 70,
    functions: 70,
    lines: 70,
    statements: 70,
  },
}
```

---

## Mocking Strategy

### Available Mocks

Located in `tests/helpers/mocks.js`:

#### MockBobClient

```javascript
const { MockBobClient } = require('../../tests/helpers/mocks');

const mockClient = new MockBobClient();
mockClient.setResponse('analyzeConflict', {
  resolution: 'accept-both',
  confidence: 0.85,
});
```

#### MockGitOperations

```javascript
const { MockGitOperations } = require('../../tests/helpers/mocks');

const mockGit = new MockGitOperations();
mockGit.setMockData({
  currentBranch: 'feature/test',
  conflicts: [{ file: 'test.js' }],
});
```

#### Mock Data Creators

```javascript
const {
  createMockConflict,
  createMockAnalysis,
  createMockGuidance,
  createMockPatch,
} = require('../../tests/helpers/mocks');

const conflict = createMockConflict({ file: 'custom.js' });
```

### Mocking External Dependencies

```javascript
// Mock entire module
jest.mock('./ibm-bob-client');

// Mock specific methods
jest.mock('./ibm-bob-client', () => ({
  resolveConflict: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock with implementation
jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
```

---

## Best Practices

### 1. Test Organization

```javascript
describe('ComponentName', () => {
  // Group related tests
  describe('methodName', () => {
    it('should handle normal case', () => {});
    it('should handle edge case', () => {});
    it('should handle error case', () => {});
  });

  describe('anotherMethod', () => {
    // ...
  });
});
```

### 2. Clear Test Names

```javascript
// ✅ Good: Describes behavior and expected outcome
it('should return Tier 2 for moderate complexity merges', () => {});

// ❌ Bad: Vague or implementation-focused
it('should work', () => {});
it('tests the classify function', () => {});
```

### 3. Arrange-Act-Assert Pattern

```javascript
it('should calculate weighted score correctly', () => {
  // Arrange: Set up test data
  const input = { value: 10 };

  // Act: Execute the code under test
  const result = calculator.calculate(input);

  // Assert: Verify the outcome
  expect(result).toBe(20);
});
```

### 4. Test One Thing at a Time

```javascript
// ✅ Good: Single responsibility
it('should validate email format', () => {
  expect(validator.isValidEmail('test@example.com')).toBe(true);
});

it('should reject invalid email format', () => {
  expect(validator.isValidEmail('invalid')).toBe(false);
});

// ❌ Bad: Testing multiple things
it('should validate email and password', () => {
  expect(validator.isValidEmail('test@example.com')).toBe(true);
  expect(validator.isValidPassword('password123')).toBe(true);
});
```

### 5. Use Descriptive Assertions

```javascript
// ✅ Good: Clear expectations
expect(result.tier).toBe(2);
expect(result.level).toBe('moderate');
expect(result.requiresAI).toBe(true);

// ❌ Bad: Vague assertions
expect(result).toBeTruthy();
expect(result.tier).toBeGreaterThan(0);
```

### 6. Test Async Code Properly

```javascript
// ✅ Good: Using async/await
it('should resolve conflicts asynchronously', async () => {
  const result = await resolver.resolveConflicts(conflicts);
  expect(result.resolved).toBe(2);
});

// ✅ Good: Using promises
it('should resolve conflicts', () => {
  return resolver.resolveConflicts(conflicts).then(result => {
    expect(result.resolved).toBe(2);
  });
});

// ❌ Bad: Not handling async properly
it('should resolve conflicts', () => {
  const result = resolver.resolveConflicts(conflicts);
  expect(result.resolved).toBe(2); // Will fail!
});
```

### 7. Clean Up After Tests

```javascript
beforeEach(() => {
  // Set up fresh state
  component = new Component();
});

afterEach(() => {
  // Clean up
  jest.clearAllMocks();
});

afterAll(() => {
  // Clean up resources
  // Close connections, etc.
});
```

### 8. Test Error Scenarios

```javascript
it('should handle missing file gracefully', async () => {
  mockGit.readFile = jest.fn().mockRejectedValue(new Error('File not found'));

  const result = await component.processFile('missing.js');

  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
});
```

### 9. Use Test Data Builders

```javascript
// Create reusable test data builders
function createTestConflict(overrides = {}) {
  return {
    file: 'test.js',
    type: 'content',
    complexity: 0.5,
    ...overrides,
  };
}

// Use in tests
it('should resolve simple conflicts', async () => {
  const conflict = createTestConflict({ complexity: 0.2 });
  // ...
});
```

### 10. Avoid Test Interdependence

```javascript
// ✅ Good: Independent tests
describe('Calculator', () => {
  it('should add numbers', () => {
    const calc = new Calculator();
    expect(calc.add(2, 3)).toBe(5);
  });

  it('should subtract numbers', () => {
    const calc = new Calculator();
    expect(calc.subtract(5, 3)).toBe(2);
  });
});

// ❌ Bad: Tests depend on each other
describe('Calculator', () => {
  let calc;

  it('should add numbers', () => {
    calc = new Calculator();
    calc.add(2, 3);
  });

  it('should have result of 5', () => {
    expect(calc.result).toBe(5); // Depends on previous test!
  });
});
```

---

## Continuous Integration

Tests run automatically on:

- **Pull Requests**: All tests must pass
- **Push to main**: Full test suite with coverage
- **Scheduled**: Nightly full test runs

### CI Configuration

See `.github/workflows/test.yml` for CI setup.

---

## Troubleshooting

### Common Issues

#### Tests Timeout

```javascript
// Increase timeout for specific test
it('should handle long operation', async () => {
  // ...
}, 30000); // 30 second timeout

// Or globally in jest.config.js
testTimeout: 10000
```

#### Mock Not Working

```javascript
// Ensure mock is hoisted
jest.mock('./module');

// Clear mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
```

#### Coverage Not Accurate

```javascript
// Exclude files from coverage
coveragePathIgnorePatterns: [
  '/node_modules/',
  '/tests/',
  '/.peacemaker/',
]
```

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

---

**Questions?** Open an issue or discussion on GitHub.

**Made with ⚔️ by the Peacemaker team**