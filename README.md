# ⚔️ PEACEMAKER

**AI-Assisted Merge Guidance for Local Git Workflows**

Transform risky merges into guided integration workflows with AI-powered conflict resolution, import reconciliation, and pre-validation - all locally before you commit.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

---

## 📋 Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [How Peacemaker Works](#how-peacemaker-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Workflow](#workflow)
- [Configuration](#configuration)
- [Examples](#examples)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

PEACEMAKER is a CLI tool that provides intelligent merge guidance before you integrate branches, offering:

- **AI-Powered Conflict Resolution** - Intelligent suggestions for resolving merge conflicts
- **Import Path Reconciliation** - Automatic detection and fixing of broken imports
- **Dependency Compatibility Checking** - Version conflict detection and resolution
- **Pre-Validation** - Syntax, import, and dependency validation before merge
- **Patch Generation & Application** - Safe, reviewable code changes

### The Complete Value Proposition

```
Traditional Merge Flow:
Feature branch → Attempt merge → Conflicts → Manual debugging → Hope it works

PEACEMAKER-Enhanced Flow:
Feature branch → Peacemaker analyzes → AI guides integration → Pre-validates → Clean merge
```

---

## 🚨 The Problem

Standard Git merges work at the text level, comparing lines and leaving conflict markers when changes overlap. This leads to:

- **Manual conflict resolution** that's slow and error-prone
- **Broken imports** after file moves or renames
- **Dependency conflicts** that aren't caught until testing
- **Syntax errors** introduced during merge resolution
- **Wasted time** on preventable failures

---

## 🛠️ How Peacemaker Works

### The Workflow

1. **Developer Creates Feature Branch** - Standard Git workflow
2. **Developer Builds Feature** - Commits changes locally
3. **Before Merging** - Run Peacemaker analysis
4. **Peacemaker Fetches Both Branches** - Gets feature and target branches
5. **Find Divergence Point** - Uses `git merge-base` to find fork point
6. **Simulate Merge** - Runs `git merge --no-commit` to detect conflicts
7. **AI-Assisted Merge Guidance Layer** - **CORE DIFFERENTIATOR**
   - Conflict Resolution Analyzer
   - Import Path Reconciler
   - Syntax Validator
   - Structural Adjustment Advisor
   - Dependency Compatibility Checker
8. **AI Pre-Validation Step** - Lightweight validation before commit
9. **Summary + Approval Layer** - Interactive review and approval
10. **Cleaned Branch Output** - Patch generation and application
11. **Developer Reviews & Commits** - Standard Git workflow
12. **Push and Create PR** - Standard GitHub workflow

### Merge Tiers

Peacemaker classifies every merge:

- **Tier 1 — Simple**: Low divergence, no conflicts. Direct merge recommended.
- **Tier 2 — Moderate**: Conflicts present, AI assistance available. Guided resolution.
- **Tier 3 — Complex**: High complexity, manual intervention required. Detailed diagnostics.

---

## 📦 Installation

### Prerequisites

- Node.js >= 18.0.0
- Git >= 2.0.0
- IBM Bob API key (for AI features)

### Global Installation (Recommended)

Install Peacemaker globally to use across all your projects:

```bash
npm install -g peacemaker
```

### Local Installation

Install in a specific project:

```bash
npm install --save-dev peacemaker
```

### Initial Setup

After installation, initialize Peacemaker in your project:

```bash
npx peacemaker init
```

This creates a `.peacemakerrc.json` configuration file in your project.

### Environment Variables

Set up your IBM Bob API credentials:

```bash
# Add to your shell profile (.bashrc, .zshrc, etc.) or .env file
export IBM_BOB_API_KEY=your_api_key_here
export IBM_BOB_API_URL=https://api.ibm.com/bob/v1
```

---

## 🚀 Quick Start

### Basic Workflow

1. **Analyze a Branch**:
   ```bash
   peacemaker analyze feature-branch --target main
   ```
   
   **Note:** Peacemaker automatically detects if your repo is a fork and uses `upstream/main` instead of `origin/main` for accurate analysis.

2. **Get AI Guidance**:
   ```bash
   peacemaker resolve feature-branch --target main
   ```

3. **Apply Patches**:
   ```bash
   peacemaker apply --commit
   ```

### Working with Forks

Peacemaker intelligently detects upstream branches:

```bash
# If you have an 'upstream' remote, Peacemaker automatically uses it
git remote add upstream https://github.com/original-repo/project.git
git fetch upstream

# Now analyze against upstream (automatic detection)
peacemaker analyze feature-branch --target main
# → Analyzes against upstream/main ✅

# Or explicitly specify
peacemaker analyze feature-branch --target upstream/main
```

---

## 📖 Commands

### `peacemaker analyze [branch]`

Analyze a branch for merge conflicts and divergence.

**Options:**
- `-t, --target <branch>` - Target branch to merge into (default: "main")
- `-o, --output <format>` - Output format: text|json (default: "text")

**Examples:**

```bash
# Analyze current branch against main
peacemaker analyze

# Analyze specific branch
peacemaker analyze feature/new-api --target develop

# JSON output for scripting
peacemaker analyze --output json
```

**Output:**
- Divergence metrics (commits ahead/behind)
- Changed files analysis
- Conflict detection
- Tier classification
- Merge complexity assessment

---

### `peacemaker resolve [branch]`

Get AI-powered suggestions for resolving merge conflicts.

**Options:**
- `-t, --target <branch>` - Target branch to merge into (default: "main")
- `--auto-apply` - Automatically apply high-confidence suggestions
- `--skip-validation` - Skip syntax validation
- `--validation-level <level>` - Validation level: basic|strict (default: "basic")
- `-o, --output <format>` - Output format: text|json (default: "text")

**Examples:**

```bash
# Interactive resolution with approval
peacemaker resolve feature-branch

# Auto-apply high-confidence suggestions
peacemaker resolve --auto-apply

# Skip validation for faster results
peacemaker resolve --skip-validation

# Strict validation mode
peacemaker resolve --validation-level strict
```

**Output:**
- Developer intent extraction
- Conflict resolution suggestions
- Import path fixes
- Dependency updates
- Syntax validation results
- Interactive approval flow
- Generated patches saved to `.peacemaker/`

---

### `peacemaker init`

Set up Peacemaker configuration in your repository.

**Options:**
- `-y, --yes` - Skip confirmation prompts
- `--verbose` - Show detailed error messages

**Examples:**

```bash
# Interactive setup
peacemaker init

# Skip confirmations
peacemaker init --yes
```

**What it does:**
- Creates `.peacemakerrc.json` - Configuration file
- Provides setup instructions for environment variables

---

### `peacemaker apply [patch-file]`

Apply generated patches to files.

**Options:**
- `-y, --yes` - Skip confirmation prompts
- `--dry-run` - Show what would be applied without making changes
- `--commit` - Create a git commit after applying patches

**Examples:**

```bash
# Apply patches with confirmation
peacemaker apply

# Apply specific patch file
peacemaker apply .peacemaker/patches.json

# Dry run to preview changes
peacemaker apply --dry-run

# Apply and commit in one step
peacemaker apply --commit --yes
```

**Output:**
- Patch summary
- Application results (success/failure)
- Files modified
- Optional git commit

---

## 🔄 Workflow

### Local Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Make changes and commit
git add .
git commit -m "Add new feature"

# 3. Before merging, analyze
peacemaker analyze --target main

# 4. Get AI guidance if needed
peacemaker resolve --target main

# 5. Review patches
cat .peacemaker/patches.md

# 6. Apply patches
peacemaker apply --commit

# 7. Push and create PR
git push origin feature/new-feature
```

---

## ⚙️ Configuration

### Environment Variables

```env
# Required
IBM_BOB_API_KEY=your_api_key_here
IBM_BOB_API_URL=https://api.ibm.com/bob/v1

# Optional
PEACEMAKER_LOG_LEVEL=info  # debug|info|warn|error
PEACEMAKER_TIMEOUT=30000    # Validation timeout in ms
```

### Project Configuration

The `.peacemakerrc.json` file is automatically created during initialization. You can customize it:

```json
{
  "validationLevel": "basic",
  "autoApply": false,
  "skipValidation": false,
  "targetBranch": "main",
  "excludePatterns": [
    "*.md",
    "*.txt",
    "docs/**",
    "test/**",
    "tests/**"
  ]
}
```

---

## 💡 Examples

### Example 1: Simple Conflict Resolution

```bash
$ peacemaker resolve feature/update-api

⚔️  PEACEMAKER - AI-Assisted Merge Guidance

✓ Git repository validated
✓ Analysis complete
✓ AI guidance generated
✓ Pre-validation complete (1250ms)

📊 Summary
   Conflicts: 2
   Import Issues: 1
   Dependency Issues: 0
   
🤖 AI Guidance
   Developer Intent: Update API endpoints to v2

⚔️  Conflict Resolutions
   1. src/api/client.js
      Confidence: 85%
      Approach: accept-both
      Reasoning: Both changes are compatible...

Would you like to review and apply AI suggestions? (Y/n)
```

### Example 2: Import Path Fixes

```bash
$ peacemaker resolve feature/refactor

📦 Import Fixes
   1. src/components/Header.jsx
      Old: ../utils/helpers
      New: ../../utils/helpers
      Confidence: 95%

Apply this fix? (Y/n)
```

### Example 3: Dependency Conflicts

```bash
$ peacemaker resolve feature/upgrade-deps

📚 Dependency Conflicts
   1. react
      Feature: ^18.0.0
      Target: ^17.0.0
      Suggested: ^18.2.0
      Risk: medium
      
Use suggested version? (Y/n)
```

---

## 🏗️ Architecture

### Core Components

```
peacemaker/
├── bin/
│   └── peacemaker.js          # CLI entry point
├── src/
│   ├── commands/              # CLI commands
│   │   ├── analyze.js         # Branch analysis
│   │   ├── resolve.js         # AI guidance
│   │   ├── apply.js           # Patch application
│   │   └── init.js            # Configuration setup
│   ├── ai/                    # AI services
│   │   ├── ibm-bob-client.js  # API client
│   │   ├── intent-extractor.js
│   │   ├── conflict-resolver.js
│   │   ├── import-reconciler.js
│   │   ├── syntax-validator.js
│   │   ├── structural-advisor.js
│   │   ├── dependency-checker.js
│   │   └── guidance-orchestrator.js
│   ├── core/                  # Core logic
│   │   ├── classifier.js      # Tier classification
│   │   ├── reporter.js        # Analysis reporting
│   │   └── guidance-reporter.js
│   ├── git/                   # Git operations
│   │   ├── operations.js      # Git wrapper
│   │   └── analyzer.js        # Conflict analysis
│   ├── patch/                 # Patch system
│   │   ├── patch-generator.js
│   │   └── patch-applicator.js
│   ├── validation/            # Pre-validation
│   │   ├── pre-validator.js
│   │   └── validation-reporter.js
│   └── utils/                 # Utilities
│       ├── logger.js
│       ├── spinner.js
│       └── config.js
└── scripts/
    └── postinstall.js         # Setup script
```

### Data Flow

```
1. User runs command
   ↓
2. Git operations (fetch, analyze, simulate merge)
   ↓
3. AI guidance generation (parallel processing)
   ↓
4. Pre-validation (syntax, imports, dependencies)
   ↓
5. Interactive approval
   ↓
6. Patch generation
   ↓
7. Patch application
   ↓
8. Git commit (optional)
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/femix300/PEACEMAKER.git
cd PEACEMAKER

# Install dependencies
npm install

# Run in development
node bin/peacemaker.js analyze
```

### Code Style

- Use ESLint configuration provided
- Follow existing code patterns
- Add JSDoc comments for functions
- Keep functions focused and small

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [IBM Bob AI](https://ibm.com/bob)
- Powered by [simple-git](https://github.com/steveukx/git-js)
- CLI built with [Commander.js](https://github.com/tj/commander.js)

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/femix300/PEACEMAKER/issues)
- **Discussions**: [GitHub Discussions](https://github.com/femix300/PEACEMAKER/discussions)
- **Documentation**: [docs/](docs/)

---

**Made with ⚔️ by the Peacemaker team**