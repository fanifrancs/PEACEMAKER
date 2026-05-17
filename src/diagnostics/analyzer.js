const path = require('path');
const logger = require('../utils/logger');

class MergeAnalyzer {
  constructor(gitOps) {
    this.gitOps = gitOps;
  }

  async analyze(baseBranch, featureBranch, metrics, classification) {
    logger.info('[Analysis] Building branch comparison report');

    const mergeBase = await this._getMergeBase(baseBranch, featureBranch);
    const sideChanges = await this._getNameStatus(mergeBase ? `${mergeBase}..${featureBranch}` : `${baseBranch}..${featureBranch}`);
    const baseChanges = mergeBase ? await this._getNameStatus(`${mergeBase}..${baseBranch}`) : [];

    const sidePaths = new Set(sideChanges.map(c => c.file));
    const basePaths = new Set(baseChanges.map(c => c.file));
    const overlappingFiles = [...sidePaths].filter(file => basePaths.has(file)).sort();

    const sideSummary = this._summarizeChanges(sideChanges);
    const baseSummary = this._summarizeChanges(baseChanges);
    const subsystemImpact = this._groupBySubsystem(sideChanges, baseChanges);

    const configFiles = sideChanges
      .filter(change => this._isConfigFile(change.file))
      .map(change => change.file);

    const deletedOnSide = sideChanges
      .filter(change => change.type === 'D')
      .map(change => change.file);

    const renamedOnSide = sideChanges
      .filter(change => change.type === 'R')
      .map(change => ({ from: change.oldFile, to: change.file }));

    const directoryMoves = this._detectDirectoryMoves(renamedOnSide, sideChanges);
    const manualActions = this._buildManualActions({
      mergeBase,
      sideChanges,
      baseChanges,
      overlappingFiles,
      configFiles,
      deletedOnSide,
      renamedOnSide,
      directoryMoves,
      classification
    });

    return {
      baseBranch,
      featureBranch,
      mergeBase,
      hasMergeBase: !!mergeBase,
      metrics,
      classification,
      sideChanges,
      baseChanges,
      sideSummary,
      baseSummary,
      overlappingFiles,
      configFiles: [...new Set(configFiles)].sort(),
      deletedOnSide,
      renamedOnSide,
      directoryMoves,
      subsystemImpact,
      manualActions
    };
  }

  printTerminalReport(analysis, classification) {
    const chalk = require('../utils/colors');

    console.log('');
    console.log(chalk.bold(chalk.cyan('Merge Analysis')));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.bold('  Base:       ') + chalk.cyan(analysis.baseBranch));
    console.log(chalk.bold('  Feature:    ') + chalk.cyan(analysis.featureBranch));
    console.log(chalk.bold('  Merge base: ') + (analysis.mergeBase ? chalk.white(analysis.mergeBase.substring(0, 12)) : chalk.red('not found')));
    console.log(chalk.bold('  Tier:       ') + chalk.white(`${classification.tier} (${classification.reasoning.summary})`));

    if (!analysis.hasMergeBase) {
      console.log(chalk.yellow('  Warning:    No merge base found; report uses branch-tip comparison.'));
    }

    console.log('');
    const sideSummaryStr = analysis.hasMergeBase
      ? this._formatSummary(analysis.sideSummary)
      : `${analysis.sideSummary.added} added, ${analysis.sideSummary.modified} modified, ${analysis.sideSummary.renamed} renamed, ${analysis.deletedOnSide.length} not present on feature (branch-tip diff — not necessarily deleted)`;
    console.log(chalk.bold('  Feature-side changes: ') + chalk.white(sideSummaryStr));
    if (analysis.baseChanges.length > 0) {
      console.log(chalk.bold('  Base-side changes:    ') + chalk.white(this._formatSummary(analysis.baseSummary)));
    }

    if (analysis.overlappingFiles.length > 0) {
      console.log(chalk.bold('  Overlap:    ') + chalk.yellow(`${analysis.overlappingFiles.length} file(s) changed on both sides`));
      analysis.overlappingFiles.slice(0, 5).forEach(file => console.log(chalk.gray(`    - ${file}`)));
      if (analysis.overlappingFiles.length > 5) {
        console.log(chalk.gray(`    ... and ${analysis.overlappingFiles.length - 5} more`));
      }
    }

    if (analysis.directoryMoves.length > 0) {
      console.log(chalk.bold('  Moves:      ') + chalk.yellow(`${analysis.directoryMoves.length} possible directory migration(s)`));
      analysis.directoryMoves.slice(0, 3).forEach(move => console.log(chalk.gray(`    - ${move.from} -> ${move.to} (${move.count} files)`)));
    }

    if (analysis.configFiles.length > 0) {
      console.log(chalk.bold('  Config:     ') + chalk.yellow(`${analysis.configFiles.length} config/build file(s) touched`));
      analysis.configFiles.slice(0, 5).forEach(file => console.log(chalk.gray(`    - ${file}`)));
    }

    if (analysis.manualActions.length > 0) {
      console.log('');
      console.log(chalk.bold('  Recommended focus:'));
      analysis.manualActions.slice(0, 4).forEach(action => console.log(chalk.gray(`    - ${action}`)));
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log('');
  }

  markdownSections(analysis) {
    const lines = [];

    lines.push('## Branch Comparison');
    lines.push('');
    lines.push(`- **Base branch:** \`${analysis.baseBranch}\``);
    lines.push(`- **Feature branch:** \`${analysis.featureBranch}\``);
    lines.push(`- **Merge base:** ${analysis.mergeBase ? `\`${analysis.mergeBase}\`` : '**not found**'}`);
    if (!analysis.hasMergeBase) {
      lines.push('- **Warning:** No merge base was found. This usually means unusual or unrelated branch history, so manual review should be extra conservative.');
    }
    lines.push('');
    lines.push(`- **Feature-side changes:** ${this._formatSummary(analysis.sideSummary)}`);
    if (analysis.baseChanges.length > 0) {
      lines.push(`- **Base-side changes:** ${this._formatSummary(analysis.baseSummary)}`);
    }
    lines.push('');

    lines.push('## Subsystem Impact');
    lines.push('');
    const subsystems = Object.entries(analysis.subsystemImpact)
      .sort((a, b) => (b[1].feature + b[1].base) - (a[1].feature + a[1].base));

    if (subsystems.length === 0) {
      lines.push('No subsystem impact data available.');
      lines.push('');
    } else {
      lines.push('| Subsystem | Feature Changes | Base Changes | Notes |');
      lines.push('|---|---:|---:|---|');
      for (const [name, impact] of subsystems) {
        const notes = [];
        if (impact.feature > 20) notes.push('large feature-side change');
        if (impact.base > 20) notes.push('large base-side change');
        if (impact.feature > 0 && impact.base > 0) notes.push('changed on both sides');
        lines.push(`| ${name} | ${impact.feature} | ${impact.base} | ${notes.join(', ') || '-'} |`);
      }
      lines.push('');
    }

    if (analysis.directoryMoves.length > 0) {
      lines.push('## Directory Moves / Restructuring');
      lines.push('');
      lines.push('Peacemaker detected possible directory-level restructuring:');
      lines.push('');
      for (const move of analysis.directoryMoves) {
        lines.push(`- \`${move.from}\` -> \`${move.to}\` (${move.count} file(s))`);
      }
      lines.push('');
      lines.push('Manual resolution should first decide the canonical directory layout before resolving individual file diffs.');
      lines.push('');
    }

    if (analysis.overlappingFiles.length > 0) {
      lines.push('## Files Changed On Both Sides');
      lines.push('');
      lines.push('These files need careful manual reconciliation because both branches touched them:');
      lines.push('');
      analysis.overlappingFiles.slice(0, 60).forEach(file => lines.push(`- \`${file}\``));
      if (analysis.overlappingFiles.length > 60) {
        lines.push(`- ... and ${analysis.overlappingFiles.length - 60} more`);
      }
      lines.push('');
    }

    if (analysis.configFiles.length > 0) {
      lines.push('## Config / Build Files To Reconcile');
      lines.push('');
      lines.push('These files affect build, runtime, dependency, deployment, or environment behavior:');
      lines.push('');
      analysis.configFiles.slice(0, 80).forEach(file => lines.push(`- \`${file}\``));
      lines.push('');
      lines.push('Manual checks:');
      lines.push('');
      lines.push('- Compare dependency changes and lockfiles together.');
      lines.push('- Confirm package scripts still match the chosen app directory.');
      lines.push('- Confirm Docker, Vite, Tailwind, TypeScript, and backend settings point to existing files.');
      lines.push('- Run the frontend build and backend checks after reconciliation.');
      lines.push('');
    }

    if (analysis.deletedOnSide.length > 0) {
      if (analysis.hasMergeBase) {
        lines.push('## Feature-Side Deletes');
        lines.push('');
        lines.push('These files were explicitly deleted on the feature branch since the merge base. Confirm each deletion is intentional:');
      } else {
        lines.push('## Files Not Present on Feature Branch');
        lines.push('');
        lines.push('No merge base was found, so these files appear in the base branch but are absent from the feature branch. They may never have existed on the feature branch — they are NOT necessarily deleted. Verify before removing any:');
      }
      lines.push('');
      analysis.deletedOnSide.slice(0, 80).forEach(file => lines.push(`- \`${file}\``));
      if (analysis.deletedOnSide.length > 80) {
        lines.push(`- ... and ${analysis.deletedOnSide.length - 80} more`);
      }
      lines.push('');
    }

    if (analysis.manualActions.length > 0) {
      lines.push('## Concrete Manual Resolution Plan');
      lines.push('');
      analysis.manualActions.forEach((action, index) => {
        lines.push(`${index + 1}. ${action}`);
      });
      lines.push('');
    }

    return lines;
  }

  _classificationTier() {
    return this._currentClassification && this._currentClassification.tier;
  }

  _formatSummary(summary) {
    return `${summary.added} added, ${summary.modified} modified, ${summary.deleted} deleted, ${summary.renamed} renamed`;
  }

  async _getMergeBase(baseBranch, featureBranch) {
    try {
      const value = await this.gitOps.git.raw(['merge-base', baseBranch, featureBranch]);
      const trimmed = value.trim();
      return trimmed || null;
    } catch (error) {
      logger.warn(`[Analysis] No merge base found between ${baseBranch} and ${featureBranch}: ${error.message}`);
      return null;
    }
  }

  async _getNameStatus(range) {
    try {
      const output = await this.gitOps.git.raw(['diff', '--name-status', range]);
      return output
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => this._parseNameStatus(line));
    } catch (error) {
      logger.warn(`[Analysis] Could not read name-status for ${range}: ${error.message}`);
      return [];
    }
  }

  _parseNameStatus(line) {
    const parts = line.split('\t');
    const status = parts[0];
    const type = status[0];

    if (type === 'R' || type === 'C') {
      return {
        status,
        type,
        oldFile: parts[1],
        file: parts[2] || parts[1]
      };
    }

    return {
      status,
      type,
      oldFile: null,
      file: parts[1] || parts[0]
    };
  }

  _summarizeChanges(changes) {
    return {
      added: changes.filter(c => c.type === 'A').length,
      modified: changes.filter(c => c.type === 'M').length,
      deleted: changes.filter(c => c.type === 'D').length,
      renamed: changes.filter(c => c.type === 'R').length
    };
  }

  _groupBySubsystem(sideChanges, baseChanges) {
    const impact = {};

    const add = (name, key) => {
      if (!impact[name]) impact[name] = { feature: 0, base: 0 };
      impact[name][key] += 1;
    };

    sideChanges.forEach(change => add(this._subsystem(change.file), 'feature'));
    baseChanges.forEach(change => add(this._subsystem(change.file), 'base'));

    return impact;
  }

  _subsystem(file) {
    if (file.startsWith('backend/')) return 'Backend';
    if (file.startsWith('Frontend/')) return 'Frontend';
    if (file.startsWith('app/')) return 'App Frontend';
    if (file.startsWith('docs/') || /(^|\/)README\.md$/i.test(file)) return 'Docs';
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(file)) return 'Assets';
    if (this._isConfigFile(file)) return 'Config / Build';
    return file.includes('/') ? file.split('/')[0] : 'Root';
  }

  _isConfigFile(file) {
    return /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Dockerfile|docker-compose\.ya?ml|vite\.config\.[jt]s|tailwind\.config\.[jt]s|tsconfig.*\.json|eslint\.config\.[jt]s|postcss\.config\.[jt]s|requirements\.txt|pyproject\.toml|manage\.py|settings\.py|urls\.py|\.env\.example|\.gitignore)$/i.test(file);
  }

  _detectDirectoryMoves(renames, sideChanges) {
    const counts = new Map();

    for (const rename of renames) {
      const fromRoot = this._firstDir(rename.from);
      const toRoot = this._firstDir(rename.to);
      if (fromRoot && toRoot && fromRoot !== toRoot) {
        const key = `${fromRoot}->${toRoot}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    const appDeletes = sideChanges.filter(c => c.type === 'D' && c.file.startsWith('app/')).length;
    const frontendAdds = sideChanges.filter(c => c.type === 'A' && c.file.startsWith('Frontend/')).length;
    if (appDeletes > 10 && frontendAdds > 10) {
      counts.set('app->Frontend', Math.max(counts.get('app->Frontend') || 0, Math.min(appDeletes, frontendAdds)));
    }

    return [...counts.entries()]
      .map(([key, count]) => {
        const [from, to] = key.split('->');
        return { from, to, count };
      })
      .sort((a, b) => b.count - a.count);
  }

  _firstDir(file) {
    return file && file.includes('/') ? file.split('/')[0] : null;
  }

  _buildManualActions({ mergeBase, sideChanges, baseChanges, overlappingFiles, configFiles, deletedOnSide, directoryMoves, classification }) {
    this._currentClassification = classification || null;
    const actions = [];

    if (!mergeBase) {
      actions.push('Resolve branch ancestry first: no merge base was found, so compare branch tips carefully before attempting rebase or automated merge.');
    }

    if (directoryMoves.length > 0) {
      const move = directoryMoves[0];
      actions.push(`Decide the canonical project layout before merging individual files, especially the apparent \`${move.from}\` to \`${move.to}\` migration.`);
    }

    if (overlappingFiles.length > 0) {
      const tier = this._classificationTier();
      if (tier === 3) {
        actions.push(`Manually reconcile ${overlappingFiles.length} file(s) changed on both branches before attempting automation again.`);
      } else {
        actions.push(`Peacemaker will attempt semantic reconciliation for ${overlappingFiles.length} file(s) changed on both branches.`);
      }
    }

    if (configFiles.length > 0) {
      actions.push(`Reconcile ${configFiles.length} config/build file(s), then run install/build/test commands for the chosen frontend and backend layout.`);
    }

    if (deletedOnSide.length > 20) {
      const deletionMsg = mergeBase
        ? `Review ${deletedOnSide.length} feature-side deletions and confirm they are intentional, especially deleted app/backend modules.`
        : `Review ${deletedOnSide.length} files present on the base branch but absent from the feature branch. No merge base exists — these files likely never existed on the feature branch and are not necessarily deleted.`;
      actions.push(deletionMsg);
    }

    const backendTouched = sideChanges.some(c => c.file.startsWith('backend/')) || baseChanges.some(c => c.file.startsWith('backend/'));
    const frontendTouched = sideChanges.some(c => c.file.startsWith('app/') || c.file.startsWith('Frontend/')) ||
      baseChanges.some(c => c.file.startsWith('app/') || c.file.startsWith('Frontend/'));

    if (frontendTouched) {
      actions.push('After manual frontend reconciliation, run the frontend package install/build flow and inspect route-level UI entrypoints.');
    }

    if (backendTouched) {
      actions.push('After manual backend reconciliation, run backend dependency checks, migrations if applicable, and API route smoke tests.');
    }

    actions.push('Break this merge into smaller PRs if possible: project layout, frontend UI, backend API, and docs/config are separate merge concerns.');

    return actions;
  }
}

module.exports = MergeAnalyzer;
