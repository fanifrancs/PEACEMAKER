# Contributing to PEACEMAKER

Thank you for your interest in contributing to PEACEMAKER! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Documentation](#documentation)

---

## 📜 Code of Conduct

This project adheres to a code of conduct that all contributors are expected to follow:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Assume good intentions
- Respect differing viewpoints and experiences

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Git >= 2.0.0
- A GitHub account
- IBM Bob API key for testing AI features

### Finding Issues to Work On

1. Check the [Issues](https://github.com/fanifrancs/PEACEMAKER/issues) page
2. Look for issues labeled `good first issue` or `help wanted`
3. Comment on the issue to let others know you're working on it
4. Wait for maintainer approval before starting work

---

## 💻 Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/PEACEMAKER.git
cd PEACEMAKER

# Add upstream remote
git remote add upstream https://github.com/fanifrancs/PEACEMAKER.git
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Add your IBM Bob API credentials
# IBM_BOB_API_KEY=your_key_here
# IBM_BOB_API_URL=https://api.ibm.com/bob/v1
```

### 4. Verify Setup

```bash
# Run the CLI
node bin/peacemaker.js --help

# Should display help information
```

---

## 📁 Project Structure

```
peacemaker/
├── bin/
│   └── peacemaker.js          # CLI entry point
├── src/
│   ├── commands/              # CLI command implementations
│   │   ├── analyze.js         # Branch analysis command
│   │   ├── resolve.js         # AI guidance command
│   │   └── apply.js           # Patch application command
│   ├── ai/                    # AI service layer
│   │   ├── ibm-bob-client.js  # IBM Bob API client
│   │   ├── intent-extractor.js
│   │   ├── conflict-resolver.js
│   │   ├── import-reconciler.js
│   │   ├── syntax-validator.js
│   │   ├── structural-advisor.js
│   │   ├── dependency-checker.js
│   │   └── guidance-orchestrator.js
│   ├── core/                  # Core business logic
│   │   ├── classifier.js      # Merge tier classification
│   │   ├── reporter.js        # Analysis reporting
│   │   └── guidance-reporter.js
│   ├── git/                   # Git operations
│   │   ├── operations.js      # Git command wrapper
│   │   └── analyzer.js        # Conflict analysis
│   ├── patch/                 # Patch generation/application
│   │   ├── patch-generator.js
│   │   └── patch-applicator.js
│   ├── validation/            # Pre-validation system
│   │   ├── pre-validator.js
│   │   └── validation-reporter.js
│   └── utils/                 # Shared utilities
│       ├── logger.js
│       ├── spinner.js
│       └── config.js
├── .github/
│   ├── workflows/
│   │   └── peacemaker.yml     # GitHub Actions workflow
│   └── scripts/
│       └── format-comment.js  # PR comment formatter
├── docs/                      # Documentation
└── tests/                     # Test files (future)
```

---

## 🔄 Development Workflow

### 1. Create a Feature Branch

```bash
# Update your fork
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Write clean, readable code
- Follow existing code patterns
- Add JSDoc comments for functions
- Keep functions focused and small
- Update documentation as needed

### 3. Test Your Changes

```bash
# Manual testing
node bin/peacemaker.js analyze
node bin/peacemaker.js resolve --help

# Test in a real repository
cd /path/to/test/repo
/path/to/PEACEMAKER/bin/peacemaker.js analyze
```

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature"
```

See [Commit Messages](#commit-messages) for guidelines.

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## 📝 Coding Standards

### JavaScript Style

- Use ES6+ features
- Use `const` and `let`, avoid `var`
- Use arrow functions where appropriate
- Use template literals for string interpolation
- Use async/await instead of callbacks

### Code Organization

```javascript
/**
 * Function description
 * @param {Type} paramName - Parameter description
 * @returns {Type} Return value description
 */
async function exampleFunction(paramName) {
  // Implementation
}
```

### Error Handling

```javascript
try {
  // Operation
} catch (error) {
  logger.error('Operation failed:', error.message);
  
  if (process.env.PEACEMAKER_LOG_LEVEL === 'debug') {
    console.error(error);
  }
  
  // Handle error appropriately
}
```

### Naming Conventions

- **Files**: kebab-case (`conflict-resolver.js`)
- **Classes**: PascalCase (`ConflictResolver`)
- **Functions**: camelCase (`resolveConflict`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Private methods**: prefix with underscore (`_internalMethod`)

---

## 🧪 Testing Guidelines

### Manual Testing Checklist

Before submitting a PR, test:

1. **Basic Commands**
   ```bash
   peacemaker --help
   peacemaker analyze --help
   peacemaker resolve --help
   peacemaker apply --help
   ```

2. **Analyze Command**
   ```bash
   peacemaker analyze
   peacemaker analyze feature-branch --target main
   peacemaker analyze --ci --output json
   ```

3. **Resolve Command**
   ```bash
   peacemaker resolve
   peacemaker resolve --skip-validation
   peacemaker resolve --validation-level strict
   ```

4. **Apply Command**
   ```bash
   peacemaker apply --dry-run
   peacemaker apply
   peacemaker apply --commit
   ```

5. **Error Cases**
   - Not a git repository
   - Invalid branch name
   - Missing API key
   - Network errors

### Test Scenarios

Create test scenarios in a separate repository:

```bash
# Scenario 1: Simple merge
git checkout -b test/simple-merge
# Make non-conflicting changes
git commit -am "Simple change"

# Scenario 2: Conflict merge
git checkout -b test/conflict-merge
# Make conflicting changes
git commit -am "Conflicting change"

# Scenario 3: Import changes
git checkout -b test/import-changes
# Move files and update imports
git commit -am "Refactor imports"
```

---

## 💬 Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
# Feature
git commit -m "feat(resolve): add auto-apply option for high-confidence suggestions"

# Bug fix
git commit -m "fix(validator): handle missing package.json gracefully"

# Documentation
git commit -m "docs(readme): add troubleshooting section"

# Refactor
git commit -m "refactor(git): extract merge simulation logic"
```

### Multi-line Commits

```bash
git commit -m "feat(apply): add patch application system

Implemented complete patch generation and application workflow:
- PatchGenerator for creating unified diffs
- PatchApplicator for applying patches safely
- Integration with resolve command
- CLI command with dry-run and commit options

Closes #123"
```

---

## 🔀 Pull Request Process

### Before Submitting

1. ✅ Code follows style guidelines
2. ✅ All manual tests pass
3. ✅ Documentation is updated
4. ✅ Commit messages follow conventions
5. ✅ Branch is up to date with main

### PR Title

Use the same format as commit messages:

```
feat(resolve): add auto-apply option
fix(validator): handle edge case in import resolution
docs(contributing): add testing guidelines
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested the changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Documentation updated
- [ ] Manual testing completed
- [ ] No breaking changes (or documented)

## Related Issues
Closes #123
```

### Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, maintainers will merge

### After Merge

```bash
# Update your fork
git checkout main
git pull upstream main
git push origin main

# Delete feature branch
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

---

## 📚 Documentation

### Code Documentation

Add JSDoc comments for all public functions:

```javascript
/**
 * Resolve conflicts using AI guidance
 * @param {Array} conflicts - List of conflicts to resolve
 * @param {Object} options - Resolution options
 * @param {string} options.approach - Resolution approach (accept-ours|accept-theirs|accept-both)
 * @param {number} options.confidence - Minimum confidence threshold
 * @returns {Promise<Object>} Resolution results
 * @throws {Error} If resolution fails
 */
async function resolveConflicts(conflicts, options = {}) {
  // Implementation
}
```

### README Updates

When adding features, update:
- Command documentation
- Examples section
- Configuration options
- Workflow diagrams

### API Documentation

For new modules, create documentation in `docs/api/`:

```markdown
# Module Name

## Overview
Brief description

## Usage
```javascript
const Module = require('./module');
const instance = new Module();
```

## API

### `method(param)`
Description

**Parameters:**
- `param` (Type): Description

**Returns:** Type - Description

**Example:**
```javascript
const result = instance.method('value');
```
```

---

## 🐛 Reporting Bugs

### Before Reporting

1. Check existing issues
2. Verify it's reproducible
3. Test with latest version

### Bug Report Template

```markdown
**Describe the bug**
Clear description of the bug

**To Reproduce**
Steps to reproduce:
1. Run command '...'
2. See error

**Expected behavior**
What should happen

**Actual behavior**
What actually happens

**Environment:**
- OS: [e.g., macOS 13.0]
- Node.js: [e.g., 18.0.0]
- Peacemaker: [e.g., 1.0.0]

**Additional context**
Any other relevant information
```

---

## 💡 Feature Requests

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
Description of the problem

**Describe the solution you'd like**
Clear description of desired feature

**Describe alternatives you've considered**
Other solutions you've thought about

**Additional context**
Any other relevant information
```

---

## 🎯 Areas for Contribution

### High Priority

- Unit tests for core modules
- Integration tests
- Performance optimizations
- Error handling improvements
- Documentation improvements

### Good First Issues

- Add more examples to README
- Improve error messages
- Add validation for edge cases
- Enhance CLI help text
- Fix typos in documentation

### Advanced Features

- Support for additional AI providers
- Advanced conflict resolution strategies
- Custom validation rules
- Plugin system
- Web UI

---

## 📞 Getting Help

- **Questions**: [GitHub Discussions](https://github.com/fanifrancs/PEACEMAKER/discussions)
- **Bugs**: [GitHub Issues](https://github.com/fanifrancs/PEACEMAKER/issues)
- **Chat**: [Discord Server](#) (if available)

---

## 🙏 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

---

Thank you for contributing to PEACEMAKER! 🎉