# ⚔️ Peacemaker

> AI-powered semantic merge resolution for Git — built with IBM Bob Shell.

Peacemaker replaces `git merge` with intent-aware conflict resolution. Instead of showing you `<<<<<<<` markers and leaving you to figure it out, Peacemaker extracts *what the developer was trying to do*, replays that intent cleanly onto the latest base branch, and asks for your approval before touching anything.

---

## How It Works

```
git merge          →  shows conflicts, you fix them manually
peacemaker merge   →  understands intent, replays it cleanly, asks you to approve
```

### The Flow

```
1. Analyze      — measure divergence between branches
2. Classify     — assign a Tier (1, 2, or 3) based on risk
3. Pre-flight   — confirm the branch is ready, optionally describe intent
4. Extract      — Bob reads commit history and infers what the branch was doing
5. Replay       — Bob applies that intent onto a fresh branch from latest main
6. Verify       — check that all expected files landed correctly
7. Approve      — you review a summary and approve or reject
8. Merge        — clean merge commit with full changelog
```

---

## Tier System

Peacemaker classifies every merge into one of three tiers before doing anything.

| Tier | Condition | Strategy | Speed |
|------|-----------|----------|-------|
| **1 — Minor** | ≤10 commits behind, ≤5 files changed, 0 conflicts | Direct git merge, no AI needed | <1 second |
| **2 — Moderate** | Up to 100 commits behind, up to 100 files, up to 30 conflicts | Bob extracts intent and replays it onto a fresh branch | 1–3 minutes |
| **3 — Critical** | >100 commits behind, >100 files, or >30 conflicts | Merge refused. AI-powered conflict resolution report generated | ~2 minutes |

### Tier 1 — Direct Merge
Small hotfixes and clean changes go straight through. No Bob call, no replay branch, no waiting. Peacemaker just merges and generates a changelog.

### Tier 2 — Intent Replay
The core Peacemaker workflow. Bob reads the feature branch's commit history, diffs, and your description to extract structured intent:
```json
{
  "summary": "Adds user registration and profile management API",
  "goals": ["Enable user registration", "Add profile endpoints"],
  "technicalApproach": "Express routes with mock data layer",
  "confidence": "high"
}
```
That intent is replayed onto a clean branch cut from the latest main — no conflict markers, no stale code. You review the result and approve.

### Tier 3 — Conflict Report
When divergence is too large for automated resolution, Peacemaker refuses the merge and generates `PEACEMAKER_DIAGNOSTIC_REPORT.md` — a file-by-file AI analysis of every conflict, with specific resolution steps, effort estimates, and a manual merge guide.

---

## Analyze Without Merging

```bash
peacemaker analyze <branch>
peacemaker analyze <branch> --base <base-branch>
```

Runs the full AI analysis pipeline without touching any branches, writing any files, or asking for approval. Safe to run at any time.

**What it produces:**
- Terminal summary: tier classification, divergence metrics, subsystem impact, config files to reconcile
- `PEACEMAKER_DIAGNOSTIC_REPORT.md`: Bob's full branch intent inference, structural differences, file-by-file guidance, merge strategy, and effort estimate

**Analysis is cached** by `branch:commitHash` in `~/.peacemaker-analyze-cache.json`. Repeat runs on the same branch at the same commit are instant — Bob is skipped entirely.

```bash
# Examples
peacemaker analyze feature/auth-overhaul
peacemaker analyze feature/auth-overhaul --base dev
```

---

## Installation

### Prerequisites
- Node.js v18+
- Git
- [IBM Bob Shell](https://bob.ibm.com) installed and authenticated

### Install Peacemaker
```bash
git clone <peacemaker-repo>
cd peacemaker
npm install
npm link        # makes `peacemaker` available globally
```

### Verify
```bash
peacemaker --version
bob 'Return only this JSON: {"test": true}' --yolo --hide-intermediary-output
```

### Environment
```bash
# Required — your Bob Shell API key
export BOBSHELL_API_KEY=your_key_here

# Optional
export PEACEMAKER_MAX_RETRIES=1   # default: 1
```

---

## Usage

### Basic merge
```bash
peacemaker merge <feature-branch>
```

### Merge into a specific base branch
```bash
peacemaker merge <feature-branch> --base <base-branch>
```

### Skip the developer intent prompt
```bash
peacemaker merge <feature-branch> --skip-prompt
```
Bob will infer intent from commit history alone. Providing a description improves accuracy.

### Debug mode
```bash
peacemaker merge <feature-branch> --debug
```
Prints full log output including Bob's raw responses, cache hits, and git operations.

### View merge statistics
```bash
peacemaker stats
```

```
📊 Peacemaker Statistics
  Total Merges:         12
  Tier 1 (Minor):        4
  Tier 2 (Moderate):     7
  Tier 3 (Critical):     1
  Retries Needed:        2
  Verification Passed:  10
  Verification Failed:   2
```

### View recent merge history
```bash
peacemaker history           # last 5 merges
peacemaker history -n 20     # last 20 merges
```

---

## CLI Reference

### `peacemaker merge <branch>`

Merge a feature branch into the current branch using semantic intent resolution.

```bash
peacemaker merge <branch> [options]
```

| Option | Description |
|--------|-------------|
| `-b, --base <branch>` | Base branch to merge into (defaults to current branch) |
| `--skip-prompt` | Skip the intent prompt (Bob infers from commits) |
| `-d, --debug` | Print extra debugging information |
| `-h, --help` | Display help |

Examples:

```bash
# Standard merge into current branch
peacemaker merge feature/auth-overhaul

# Merge into a specific base branch
peacemaker merge feature/auth-overhaul --base dev

# Skip the intent prompt
peacemaker merge feature/auth-overhaul --skip-prompt

# Debug mode
peacemaker merge feature/auth-overhaul --debug
```

---

### `peacemaker analyze <branch>`

Analyze a branch and generate an AI-powered report without merging.

```bash
peacemaker analyze <branch> [options]
```

| Option | Description |
|--------|-------------|
| `-b, --base <branch>` | Base branch to compare against (defaults to current branch) |
| `-h, --help` | Display help |

Examples:

```bash
# Analyze against current branch
peacemaker analyze feature/auth-overhaul

# Analyze against a specific base
peacemaker analyze feature/auth-overhaul --base dev
```

---

### `peacemaker stats`

Show aggregate statistics across all Peacemaker merges in this repo.

```bash
peacemaker stats
```

Example output:

```
📊 Peacemaker Statistics

  Total Merges:          23
  Tier 1 (Minor):         2
  Tier 2 (Moderate):     20
  Tier 3 (Critical):      0
  Retries Needed:         0
  Verification Passed:   20
  Verification Failed:    2
```

---

### `peacemaker history`

Show recent merge history from the changelog.

```bash
peacemaker history [options]
```

| Option | Description |
|--------|-------------|
| `-n, --count <number>` | Number of entries to show (default: 5) |
| `-h, --help` | Display help |

Examples:

```bash
# Show last 5 merges (default)
peacemaker history

# Show last 20 merges
peacemaker history -n 20
```

---

### Global options

```bash
peacemaker -V          # Print version number
peacemaker --version   # Print version number
peacemaker -h          # Display help
peacemaker --help      # Display help
```

---

## Command Reference

```
peacemaker [options] [command]

Commands:
  merge [options] <branch>    Merge a feature branch using semantic intent resolution
  analyze [options] <branch>  Analyze a branch and generate an AI report without merging
  stats                       Show Peacemaker merge statistics
  history [options]           Show recent merge history
  help [command]              Display help for a command

Options:
  -V, --version               Output version number
  -h, --help                  Display help

merge options:
  -d, --debug                 Output extra debugging information
  --skip-prompt               Skip developer intent prompt (Bob infers from history)
  -b, --base <branch>         Base branch to merge into (default: current branch)
  -h, --help                  Display help

analyze options:
  -b, --base <branch>         Base branch to compare against (default: current branch)
  -h, --help                  Display help

history options:
  -n, --count <number>        Number of entries to show (default: 5)
```

---

## Pre-flight Check

Every merge (including `--skip-prompt`) runs a pre-flight check:

```
📋 Pre-flight Check
──────────────────────────────────────────────────
  Branch:      feature/add-user-profile
  Last commit: "docs: add profile endpoints to README" (fc66f77, 3 hours ago)
  Files:       src/app.js, src/profile.js, src/auth.js (+3 more)
──────────────────────────────────────────────────

Is this branch committed and ready to merge? (Y/n):
```

If you answer `n`, the merge is cancelled with no changes made.

Without `--skip-prompt`, Peacemaker then asks:
```
💬 What was this branch trying to do?
```
This description is passed directly to Bob and weighted heavily in intent extraction. Providing it improves accuracy and speeds up the Bob call.

---

## Intent Caching

Bob calls are cached by `branch:headHash` in `~/.peacemaker-intent-cache.json`. If you run the same merge twice (e.g. after rejecting it), Bob is skipped on the second run:

```
✓ Intent extracted (cache hit — Bob skipped)
```

The cache holds up to 50 entries and is trimmed automatically. To force a fresh Bob call:
```bash
rm ~/.peacemaker-intent-cache.json
```

---

## Approval Flow

After replay, Peacemaker shows a full summary before touching the base branch:

```
╔══════════════════════════════════════════════════╗
║          PEACEMAKER MERGE SUMMARY                ║
╚══════════════════════════════════════════════════╝

Branch: feature/add-user-profile
Tier: 2 — Moderate divergence

Intent Extracted:
  "Adds user registration and profile management API"
  Confidence: high
  Goals:
    • Enable user registration with username, password, and email
    • Provide GET and PUT profile endpoints

Replay Status:
  ✓ Intent replayed successfully (1 attempt)
  ✓ Verification passed

Files Modified:
  ~ src/app.js
  ~ src/auth.js
  ~ src/profile.js
  + src/config.js

Approve this merge? (y/N):
```

Answering `n` cleans up the replay branch and exits with no changes to main.

---

## Output Files

| File | Location | Description |
|------|----------|-------------|
| `PEACEMAKER_CHANGELOG.md` | repo root | Running log of all Peacemaker merges |
| `PEACEMAKER_DIAGNOSTIC_REPORT.md` | repo root | Generated on Tier 3 refusals |
| `peacemaker.log` | repo root | Debug log (gitignored) |
| `~/.peacemaker-intent-cache.json` | home dir | Intent cache across sessions |
| `~/.peacemaker-analyze-cache.json` | home dir | Analyze cache — repeat runs instant |

Add these to your `.gitignore` (except the changelog if you want to keep it):
```
peacemaker.log
PEACEMAKER_DIAGNOSTIC_REPORT.md
.bob/
```

---

## Example Session

```bash
$ peacemaker merge feature/add-payments

⚔️  PEACEMAKER - Semantic Merge Resolution

✔ Branch analysis complete (12 behind, 4 ahead)
✔ Classified as Tier 2

📋 Pre-flight Check
  Branch:      feature/add-payments
  Last commit: "feat: add Stripe webhook handler" (a3f2c11, 2 days ago)
  Files:       src/payments.js, src/webhooks.js, README.md (+1 more)

Is this branch committed and ready to merge? (Y/n): y

💬 What was this branch trying to do? integrates Stripe payments with webhook support
✓ Intent noted: "integrates Stripe payments with webhook support"

⚡ Running intent extraction and branch creation in parallel...
✓ Fresh branch created: peacemaker-replay-1778694784432
✓ Intent extracted (cache hit — Bob skipped)

⠿ Replaying intent onto fresh branch...
✓ Intent replayed successfully

╔══════════════════════════════════════════════════╗
║          PEACEMAKER MERGE SUMMARY                ║
╚══════════════════════════════════════════════════╝

Branch: feature/add-payments
Tier: 2 — Moderate divergence — Risk: MODERATE

Intent: "Integrates Stripe payment processing with webhook support for async events"
Confidence: high
Goals:
  • Add Stripe SDK integration
  • Handle payment webhooks for subscription events
  • Document payment API endpoints

Replay Status: ✓ Passed on first attempt
Files Modified: src/payments.js, src/webhooks.js, src/config.js, README.md

Approve this merge? (y/N): y

✓ Merge completed successfully!
Branch feature/add-payments merged into main.
📋 Changelog: PEACEMAKER_CHANGELOG.md
Made with Bob 🤖
```

---

## How It Differs from `git merge`

| | `git merge` | `peacemaker merge` |
|--|------------|-------------------|
| Conflict resolution | Manual (`<<<<<<<` markers) | AI replays intent onto clean branch |
| Understanding intent | None | Extracts goals, approach, key changes |
| Tier-aware strategy | No | Skips AI for simple merges, escalates for complex ones |
| Approval gate | No | Always shows summary before touching main |
| Audit trail | Git log only | Structured changelog + diagnostic reports |
| Large divergence | Dumps all conflicts on you | Refuses with AI-generated resolution guide |

---

## Built With

- **[IBM Bob Shell](https://bob.ibm.com)** — agentic AI that extracts and replays developer intent
- **Node.js** — CLI runtime
- **simple-git** — Git operations
- **commander** — CLI framework
- **ora / chalk** — terminal UI

---

*Made with Bob 🤖 — IBM Bob Hackathon, May 2026*
