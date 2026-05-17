const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ANALYZE_CACHE_PATH = path.join(os.homedir(), '.peacemaker-analyze-cache.json');
const logger = require('../utils/logger');
const BobClient = require('../bob/client');

/**
 * Diagnostic Reporter - Generates detailed reports for Tier 3 merges
 * Explains why a merge was refused and provides actionable recommendations
 */
class DiagnosticReporter {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.reportPath = 'PEACEMAKER_DIAGNOSTIC_REPORT.md';
    this.bobClient = new BobClient();
  }

  /**
   * Generate comprehensive diagnostic report for refused merge
   * @param {string} branch - Feature branch name
   * @param {Object} classification - Classification result
   * @param {Object} metrics - Branch metrics
   * @returns {Promise<string>} Path to generated report
   */
  async generateReport(branch, classification, metrics, rawContext = null, mergeAnalysis = null, options = {}) {
    logger.info('Generating Tier 3 diagnostic report...');

    try {
      const report = await this._buildReport(branch, classification, metrics, rawContext, mergeAnalysis, options);
      
      await fs.writeFile(this.reportPath, report, 'utf-8');
      
      logger.info(`Diagnostic report generated: ${this.reportPath}`);
      return this.reportPath;

    } catch (error) {
      logger.error(`Failed to generate diagnostic report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build the complete diagnostic report
   * @private
   */
  async _buildReport(branch, classification, metrics, rawContext = null, mergeAnalysis = null, options = {}) {
    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour12: false }).replace(',', '');
    const lines = [];

    // Header
    lines.push('# Peacemaker Diagnostic Report - MERGE REFUSED');
    lines.push('');
    lines.push(`**Branch:** ${branch}`);
    lines.push(`**Tier:** 3 (Critical Divergence)`);
    lines.push(`**Generated:** ${timestamp}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Risk Summary
    lines.push('## Risk Summary');
    lines.push('');
    lines.push(`- **${classification.metrics.commitsBehind}** commits behind main`);
    lines.push(`- **${classification.metrics.commitsAhead}** commits ahead of main`);
    lines.push(`- **${classification.metrics.changedFilesCount}** files modified`);
    lines.push(`- **${classification.metrics.conflictingFilesCount}** potential conflicts`);
    lines.push('');
    
    if (classification.scores) {
      lines.push('### Risk Scores');
      lines.push('');
      lines.push(`- Divergence Score: **${classification.scores.divergence}/100** ${this._getRiskEmoji(classification.scores.divergence)}`);
      lines.push(`- Complexity Score: **${classification.scores.complexity}/100** ${this._getRiskEmoji(classification.scores.complexity)}`);
      lines.push(`- Conflict Score: **${classification.scores.conflict}/100** ${this._getRiskEmoji(classification.scores.conflict)}`);
      lines.push(`- Overall Risk: **${classification.scores.overall}/100** ${this._getRiskEmoji(classification.scores.overall)}`);
      lines.push('');
    }

    // Single-line refusal reason — no redundant block
    lines.push(`> **Refused:** ${classification.reasoning.details}`);
    lines.push('');

    if (mergeAnalysis) {
      lines.push(...this._buildMergeAnalysisSections(mergeAnalysis));
    }

    // Conflict Hotspots — only shown when there are actual conflicts
    if (metrics.conflictingFiles && metrics.conflictingFiles.length > 0) {
      lines.push('## Conflict Hotspots');
      lines.push('');
      lines.push('The following files have conflicting changes that require manual resolution:');
      lines.push('');
      metrics.conflictingFiles.forEach(file => {
        lines.push(`- \`${file}\``);
      });
      lines.push('');
    }

    // Backup command — concrete and branch-specific
    lines.push('## Before You Start: Create a Backup');
    lines.push('');
    lines.push('Peacemaker creates a backup tag automatically before any merge attempt. If you want to create one manually:');
    lines.push('```bash');
    const _backupBase = (mergeAnalysis && mergeAnalysis.baseBranch) || 'HEAD';
    lines.push(`git tag peacemaker-manual-backup-${branch.replace(/\//g, '-')}-$(date +%s) ${_backupBase}`);
    lines.push('```');
    lines.push('');

    // Team Coordination
    lines.push('## Team Coordination Checklist');
    lines.push('');
    lines.push('Before attempting manual merge, coordinate with:');
    lines.push('');
    
    const commitAuthors = await this._getRecentCommitAuthors(branch);
    if (commitAuthors.length > 0) {
      lines.push('### Contributors on This Branch');
      lines.push('');
      commitAuthors.forEach(author => {
        lines.push(`- [ ] ${author}`);
      });
      lines.push('');
    }

    lines.push('### Discussion Points');
    lines.push('');
    lines.push('- [ ] Review the intent of this feature branch');
    lines.push('- [ ] Identify which changes from base conflict with this branch');
    lines.push('- [ ] Decide on merge strategy (rebase vs. merge commit)');
    lines.push('- [ ] Assign responsibility for resolving specific files');
    lines.push('- [ ] Plan testing strategy post-merge');
    lines.push('');

    // Bob-powered deep analysis — runs regardless of conflict count
    lines.push('## AI Branch Analysis');
    lines.push('');
    lines.push('Bob has analyzed the feature branch intent and generated specific guidance:');
    lines.push('');
    try {
      const aiGuide = await this._generateAIBranchAnalysis(branch, metrics, rawContext, mergeAnalysis, { useCache: options.useCache || false });
      lines.push(aiGuide);
    } catch (error) {
      logger.warn(`Could not generate AI branch analysis: ${error.message}`);
      lines.push('> AI analysis could not be generated. Refer to manual steps above.');
    }
    lines.push('');

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Generated by Peacemaker - AI-powered semantic merge resolution*');
    lines.push('');
    lines.push('For questions or support, refer to the Peacemaker documentation.');

    return lines.join('\n');
  }

  _buildMergeAnalysisSections(mergeAnalysis) {
    try {
      const MergeAnalyzer = require('./analyzer');
      const analyzer = new MergeAnalyzer(this.gitOps);
      return analyzer.markdownSections(mergeAnalysis);
    } catch (error) {
      logger.warn(`Could not render merge analysis sections: ${error.message}`);
      return [];
    }
  }

  async _getRecentCommitAuthors(branch) {
    try {
      // Get commits on feature branch only
      const output = await this.gitOps.git.raw([
        'log', branch, '--not', `--remotes=origin/HEAD`,
        '--format=%an|||%ae', '--max-count=100'
      ]);
      const seen = new Map(); // key -> display name
      for (const line of output.split('\n').filter(Boolean)) {
        const [name, email] = line.split('|||');
        const isEmailOnly = !name || name.includes('@') || /^[a-f0-9]{7,}$/.test(name.trim());
        const display = (isEmailOnly ? (email || name) : name).trim();
        if (!display) continue;
        const key = display.toLowerCase().replace(/\s+/g, '');
        if (!seen.has(key)) seen.set(key, display);
      }
      return Array.from(seen.values()).sort();
    } catch (error) {
      logger.debug(`Could not get commit authors: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyze affected files using real git data from mergeAnalysis
   * @private
   */
  async _analyzeAffectedFiles(branch, metrics, mergeAnalysis) {
    const analysis = [];

    if (!mergeAnalysis || !mergeAnalysis.sideChanges || mergeAnalysis.sideChanges.length === 0) {
      return analysis;
    }

    const overlappingSet = new Set(mergeAnalysis.overlappingFiles || []);
    const diffStats = await this._getDiffStats(mergeAnalysis.mergeBase, branch);
    const filesToShow = mergeAnalysis.sideChanges.slice(0, 20);

    for (const change of filesToShow) {
      const file = change.file;
      const isConflicting = overlappingSet.has(file);
      const stat = diffStats[file] || {};
      const typeLabel = ({ A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed', C: 'Copied' })[change.type] || change.type;
      const displayFile = change.type === 'R' ? `${change.oldFile} → ${file}` : file;

      let riskLevel, reason, recommendation;

      if (isConflicting) {
        riskLevel = 'HIGH ⚠';
        reason = `Modified on both branches — needs manual reconciliation`;
        recommendation = `git diff ${(mergeAnalysis.mergeBase || '').substring(0, 8)}..main -- ${file}  vs  git diff ${(mergeAnalysis.mergeBase || '').substring(0, 8)}..${branch} -- ${file}`;
      } else if (change.type === 'D') {
        riskLevel = 'MODERATE';
        reason = 'Deleted on feature branch — confirm deletion is intentional, not a rebase artifact';
        recommendation = `git log --oneline -- ${file}`;
      } else if (change.type === 'R') {
        riskLevel = 'LOW';
        reason = `Renamed from ${change.oldFile} — verify all import references updated`;
        recommendation = `grep -r "${change.oldFile}" . --include="*.js" --include="*.ts"`;
      } else if (this._isConfigFile(file)) {
        riskLevel = 'MODERATE';
        reason = 'Config/build file — may affect install, build, or runtime environment';
        recommendation = `git diff main -- ${file}`;
      } else if (change.type === 'A') {
        riskLevel = 'LOW';
        reason = 'New file added only on feature branch';
        recommendation = `Verify no duplicate exists on main under a different path`;
      } else {
        const lines = stat.added !== undefined ? ` (+${stat.added}/-${stat.removed} lines)` : '';
        riskLevel = 'LOW';
        reason = `Modified only on feature branch${lines}`;
        recommendation = `git diff ${(mergeAnalysis.mergeBase || '').substring(0, 8)}..${branch} -- ${file}`;
      }

      analysis.push({ file: displayFile, riskLevel, reason, recommendation, stat, typeLabel });
    }

    if (mergeAnalysis.sideChanges.length > 20) {
      analysis.push({
        file: `… and ${mergeAnalysis.sideChanges.length - 20} more files`,
        riskLevel: '-', reason: 'See full git diff for complete list', recommendation: '', stat: {}, typeLabel: ''
      });
    }

    return analysis;
  }

  /**
   * Get per-file insertion/deletion counts from git diff --numstat
   * @private
   */
  async _getDiffStats(mergeBase, branch) {
    const stats = {};
    if (!mergeBase) return stats;
    try {
      const output = await this.gitOps.git.raw(['diff', '--numstat', `${mergeBase}..${branch}`]);
      for (const line of output.split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        if (parts.length === 3) stats[parts[2]] = { added: parts[0], removed: parts[1] };
      }
    } catch (err) {
      logger.debug(`Could not get diff stats: ${err.message}`);
    }
    return stats;
  }

  /**
   * Check if file is a core system file
   * @private
   */
  _isCoreFile(file) {
    const corePatterns = [
      /^src\/core\//,
      /^src\/engine\//,
      /^src\/main\./,
      /^src\/app\./,
      /^src\/index\./,
      /^lib\/core\//,
      /^app\/core\//
    ];

    return corePatterns.some(pattern => pattern.test(file));
  }

  /**
   * Check if file is a configuration file
   * @private
   */
  _isConfigFile(file) {
    const configPatterns = [
      /package\.json$/,
      /tsconfig\.json$/,
      /webpack\.config\./,
      /\.env/,
      /config\./,
      /\.config\./
    ];

    return configPatterns.some(pattern => pattern.test(file));
  }

  /**
   * Get recent commit authors for coordination
   * @private
   */
  async _getRecentCommitAuthors(branch) {
    try {
      const defaultBranch = await this.gitOps.getDefaultBranch();
      const log = await this.gitOps.git.log({
        from: branch,
        to: defaultBranch,
        '--max-count': '50'
      });

      const authors = new Set();
      log.all.forEach(commit => {
        if (commit.author_name) {
          authors.add(commit.author_name);
        }
      });

      return Array.from(authors);

    } catch (error) {
      logger.debug(`Could not get commit authors: ${error.message}`);
      return [];
    }
  }

  /**
   * Get risk emoji for score
   * @private
   */
  async _generateAIBranchAnalysis(branch, metrics, rawContext, mergeAnalysis, options = {}) {
    const hasMergeBase = !!(mergeAnalysis && mergeAnalysis.mergeBase);
    const sideChanges = (mergeAnalysis && mergeAnalysis.sideChanges) || [];
    const fileContents = (rawContext && rawContext.fileContents) || {};
    const baseBranch = (mergeAnalysis && mergeAnalysis.baseBranch) || 'base';

    // --- Cache check ---
    let tipHash = 'unknown';
    try {
      tipHash = execSync(`git rev-parse ${branch}`, { cwd: process.cwd(), encoding: 'utf8' }).trim().substring(0, 12);
    } catch (e) { /* leave as unknown */ }
    const cacheKey = `${branch}:${tipHash}`;

    if (options.useCache) {
      try {
        const raw = fsSync.readFileSync(ANALYZE_CACHE_PATH, 'utf8');
        const cache = JSON.parse(raw);
        if (cache[cacheKey]) {
          logger.info(`[Analyze Cache] Hit for ${cacheKey} — skipping Bob calls`);
          return cache[cacheKey];
        }
      } catch (e) { /* no cache yet */ }
    }

    // --- Build file list: 15 files, 80-char snippets ---
    const relevant = sideChanges.filter(c => c.type !== 'D');
    const fileLines = relevant.slice(0, 15).map(change => {
      const typeLabel = ({ A: 'ADDED', M: 'MODIFIED', R: 'RENAMED', C: 'COPIED' })[change.type] || change.type;
      const displayPath = change.type === 'R' ? `${change.oldFile} → ${change.file}` : change.file;
      const snippet = fileContents[change.file]
        ? fileContents[change.file].substring(0, 80).replace(/`/g, "'").split('\n')[0]
        : null;
      return `- [${typeLabel}] ${displayPath}${snippet ? ` | ${snippet}` : ''}`;
    });
    if (relevant.length > 15) fileLines.push(`- ... and ${relevant.length - 15} more`);

    const ctx = `BRANCH: ${branch}
BASE: ${baseBranch}
MERGE BASE: ${hasMergeBase ? 'found' : 'NOT FOUND — unrelated history'}
COMMITS BEHIND: ${metrics.commitsBehind} | AHEAD: ${metrics.commitsAhead}
FILES (${sideChanges.length} total, showing ${fileLines.length} non-absent):
${fileLines.join('\n')}`;

    // --- 3 focused prompts fired in parallel (prompt1+2 merged) ---
    const prompt1 = `Senior engineer reviewing a diverged branch. Answer in Markdown.

${ctx}

## What This Branch Was Building
Infer the feature/refactor/fix from file names. Name the subsystems, UI components, backend modules involved. Note major structural changes. Be specific, 150-200 words.

## Key Structural Differences
List the most important architectural differences. Cover: directory layout, config conflicts, entry point differences, dependency changes. For each state the practical impact. 150-200 words.`;

    const prompt2 = `Senior engineer reviewing a diverged branch. Answer in Markdown.

${ctx}

## File-by-File Guidance
Pick the 5 highest-risk files (prioritise: config files, entry points, renamed files). For each use exactly:

#### \`path/to/file\`
**What changed:** one sentence
**What to do:** numbered steps with exact git commands

No preamble. Start directly with the first #### heading.`;

    const prompt3 = `Senior engineer reviewing a diverged branch. Answer in Markdown.

${ctx}

## Recommended Merge Strategy
Given the actual files, what is the smartest concrete approach? Name specific files to cherry-pick, directories to copy, or commits to keep. No generic advice.

## Estimated Effort
Realistic time estimate with breakdown by task. End with a single sentence summary.`;

    logger.info('[Tier 3] Firing 3 parallel Bob analysis calls...');
    const results = await Promise.allSettled([
      this.bobClient._executeBobShell(prompt1),
      this.bobClient._executeBobShell(prompt2),
      this.bobClient._executeBobShell(prompt3)
    ]);

    const parts = results.map((r, i) => {
      if (r.status === 'fulfilled') return this.bobClient._stripMarkdownProse(r.value);
      logger.warn(`[Tier 3] AI call ${i + 1} failed: ${r.reason}`);
      return `> Analysis part ${i + 1} could not be generated.`;
    });

    const output = parts.join('\n\n');

    // --- Write cache (analyze command only) ---
    if (options.useCache) {
      try {
        let cache = {};
        try { cache = JSON.parse(fsSync.readFileSync(ANALYZE_CACHE_PATH, 'utf8')); } catch (e) {}
        cache[cacheKey] = output;
        fsSync.writeFileSync(ANALYZE_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
        logger.info(`[Analyze Cache] Saved for ${cacheKey}`);
      } catch (e) {
        logger.warn(`[Analyze Cache] Could not write cache: ${e.message}`);
      }
    }

    return output;
  }

  _getRiskEmoji(score) {
    if (score < 30) return '🟢';
    if (score < 70) return '🟡';
    return '🔴';
  }
}

module.exports = DiagnosticReporter;

// Made with Bob