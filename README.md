# Peacemaker ⚔️

**Smarter Git merges, powered by AI.**

---

## What is Peacemaker?

Peacemaker is a command-line tool that makes merging branches safer and more intelligent. Instead of blindly combining lines of code and leaving you to untangle conflicts, Peacemaker understands *what a branch was trying to do* — and replays that intention cleanly onto the latest version of your codebase.

---

## The Problem with Normal Merges

Standard Git merges work at the text level. They compare lines, find differences, and when two changes touch the same area, they give up and leave conflict markers in your code for you to resolve manually.

This works fine for simple cases. But when your main branch has moved forward while a feature branch was in development, you often end up with conflicts that aren't real conflicts — just two sets of unrelated changes that landed near each other. Resolving them by hand is slow, error-prone, and requires context that isn't always obvious from the diff alone.

---

## How Peacemaker Works

Peacemaker takes a different approach. When you merge a branch, it:

1. **Understands intent** — It reads the branch history and extracts what the developer was actually trying to accomplish, not just which lines changed.

2. **Analyses the divergence** — It identifies exactly which files were changed by the feature branch, which were changed by main, and which overlap. It uses the true fork point, so base-branch updates are never misread as feature-branch deletions.

3. **Replays the work cleanly** — Instead of merging onto a potentially stale base, Peacemaker creates a fresh branch from the latest main and applies the feature branch's intent onto it directly.

4. **Resolves overlapping files intelligently** — When both branches touched the same file, Peacemaker attempts a clean three-way merge automatically. If that produces conflicts, it uses AI to resolve the overlap for that single file — preserving all functionality from both sides.

5. **Validates everything before you see it** — Files are checked for existence, completeness, syntax errors, and conflict markers. If anything looks wrong, the merge is rejected before it ever reaches you.

6. **Requires your approval** — A clear summary is presented before anything is committed to main. You approve or reject. If verification failed, approval is not offered.

---

## Merge Tiers

Peacemaker classifies every merge before acting:

**Tier 1 — Simple:** Low divergence, no overlapping files. Peacemaker merges directly and safely.

**Tier 2 — Moderate:** Both branches have moved. Peacemaker uses intent replay to land the feature cleanly on the latest base, resolving overlaps where possible.

**Tier 3 — Complex:** High divergence, structural changes, or too much ambiguity for safe automation. Peacemaker refuses to merge and produces a detailed diagnostic report explaining exactly what needs human attention and why.

---

## What Makes It Safe

- Peacemaker never commits to main without your explicit approval.
- If verification fails at any point, the merge is cancelled and the repository is left untouched.
- Approval is disabled entirely for merges that did not pass verification — you cannot accidentally approve a broken result.
- All work happens on a temporary branch that is cleaned up automatically on cancellation.

---

## Intent Caching

Extracting intent from a branch takes a few seconds. Peacemaker caches the result against the branch's commit hash, so re-running the same merge (with no new commits) skips the extraction step entirely. The cache persists across sessions.

---

*Built with IBM Bob Shell.*