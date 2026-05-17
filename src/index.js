#!/usr/bin/env node

const { program } = require('commander');
const ora = require('ora');
const chalk = require('./utils/colors');
const GitOperations = require('./git/operations');
const DivergenceClassifier = require('./classifier/divergence');
const IntentExtractor = require('./intent/extractor');
const IntentReplay = require('./bob/replay');
const ApprovalWorkflow = require('./approval/workflow');
const ChangelogGenerator = require('./changelog/generator');
const DiagnosticReporter = require('./diagnostics/reporter');
const MergeAnalyzer = require('./diagnostics/analyzer');
const logger = require('./utils/logger');

// Initialize components
const gitOps = new GitOperations();
const classifier = new DivergenceClassifier();
const intentExtractor = new IntentExtractor(gitOps);
const intentReplay = new IntentReplay(gitOps);
const approvalWorkflow = new ApprovalWorkflow();
const changelogGenerator = new ChangelogGenerator();
const diagnosticReporter = new DiagnosticReporter(gitOps);
const mergeAnalyzer = new MergeAnalyzer(gitOps);

// Set up CLI
program
  .name('peacemaker')
  .description('AI-powered semantic intent resolution for Git merges')
  .version('0.1.0');

// Add merge command
program.command('merge')
  .description('Merge a feature branch using semantic intent resolution')
  .argument('<branch>', 'Feature branch to merge')
  .option('-d, --debug', 'Output extra debugging information')
  .option('--skip-prompt', 'Skip developer intent prompt')
  .option('-b, --base <branch>', 'Base branch to merge into (defaults to current branch)')
  .action(async (branch, options) => {
    let spinner;
    let freshBranchName = null;
    let defaultBranch = null;
    
    try {
      if (options.debug) {
        logger.setLevel('debug');
      }

      console.log(chalk.bold(chalk.cyan('\n⚔️  PEACEMAKER - Semantic Merge Resolution\n')));
      logger.info(`Starting merge for branch: ${branch}`);

      // ============================================
      // PHASE 1: Git Analysis
      // ============================================
      spinner = ora('Analyzing branch divergence...').start();

      defaultBranch = options.base || (await gitOps.git.branch()).current;
      if (!options.base && defaultBranch.startsWith('peacemaker-replay-')) {
        // getDefaultBranch() falls back to current branch which is still the stale one.
        // Instead, probe local branches directly for standard candidates.
        const localBranches = (await gitOps.git.branch()).all;
        const candidates = ['main', 'master', 'trunk', 'develop', 'development'];
        const detected = candidates.find(c => localBranches.includes(c));
        if (detected) {
          const staleBranch = defaultBranch;
          defaultBranch = detected;
          console.log(chalk.yellow(`\n⚠ Detected stale replay branch as current. Switching base to: ${defaultBranch}\n`));
          await gitOps.git.checkout(defaultBranch);
          try {
            await gitOps.git.deleteLocalBranch(staleBranch, true);
            console.log(chalk.gray(`  🧹 Deleted stale replay branch: ${staleBranch}`));
            logger.info(`[Cleanup] Deleted stale replay branch on startup: ${staleBranch}`);
          } catch (e) {
            logger.warn(`[Cleanup] Could not delete stale branch ${staleBranch}: ${e.message}`);
          }
        } else {
          console.log(chalk.red(`\n❌ Could not detect base branch — you are on a stale replay branch. Please checkout main manually and retry.\n`));
          process.exit(1);
        }
      }
      logger.debug(`Using base branch: ${defaultBranch}`);

      const forkPoint = await gitOps.findForkPoint(branch, defaultBranch);
      logger.debug(`Fork point: ${forkPoint}`);

      const [commitsBehind, commitsAhead, changedFiles, conflictingFiles] = await Promise.all([
        gitOps.getCommitsBehind(branch, defaultBranch),
        gitOps.getCommitsAhead(branch, defaultBranch),
        gitOps.getChangedFiles(branch, defaultBranch),
        gitOps.getConflictingFiles(branch, defaultBranch)
      ]);

      const metrics = {
        commitsBehind,
        commitsAhead,
        changedFiles,
        conflictingFiles
      };

      // Remove stale untracked files that are creations on the feature branch.
      // Failed replay attempts can leave these behind and corrupt later snapshots.
      for (const filePath of changedFiles) {
        let existsOnBase = true;
        try {
          await gitOps.git.raw(['cat-file', '-e', `${defaultBranch}:${filePath}`]);
        } catch {
          existsOnBase = false;
        }

        if (!existsOnBase) {
          try {
            const statusText = await gitOps.git.raw(['status', '--porcelain', '--', filePath]);
            const statusLines = statusText.trim().split('\n').filter(Boolean);
            const onlyUntracked = statusLines.length > 0 && statusLines.every(line => line.startsWith('?? '));

            if (onlyUntracked) {
              await require('fs').promises.unlink(filePath);
              logger.info(`[Preflight] Removed stale untracked file from prior replay: ${filePath}`);
            }
          } catch (cleanupErr) {
            if (cleanupErr && cleanupErr.code !== 'ENOENT') {
              logger.warn(`[Preflight] Could not clean stale file ${filePath}: ${cleanupErr.message}`);
            }
          }
        }
      }

      spinner.succeed(chalk.green('Branch analysis complete'));
      logger.info(`Branch is ${commitsBehind} behind, ${commitsAhead} ahead`);

      // ============================================
      // PHASE 2: Classification
      // ============================================
      spinner = ora('Classifying merge complexity...').start();

      const classification = classifier.classify(metrics);
      
      spinner.succeed(chalk.green(`Classified as Tier ${classification.tier}`));
      logger.info(`Tier ${classification.tier}: ${classification.reasoning.summary}`);

      let mergeAnalysis = null;
      try {
        spinner = ora('Building merge analysis report...').start();
        mergeAnalysis = await mergeAnalyzer.analyze(defaultBranch, branch, metrics, classification);
        spinner.succeed(chalk.green('Merge analysis complete'));
        mergeAnalyzer.printTerminalReport(mergeAnalysis, classification);
      } catch (analysisError) {
        spinner.warn(chalk.yellow('Merge analysis unavailable'));
        logger.warn(`Could not build merge analysis: ${analysisError.message}`);
      }

      // ============================================
      // PHASE 3: Handle by Tier
      // ============================================

      // TIER 3: Critical - Refuse and generate AI-powered diagnostic report
      if (classification.tier === 3) {
        // Show refusal immediately — user knows the outcome before waiting for Bob
        approvalWorkflow.displayTier3Refusal();

        spinner = ora('Generating detailed resolution report — this may take a moment...').start();

        // Extract raw context so Bob can analyze both sides
        let tier3RawContext = null;
        try {
          const IntentExtractor = require('./intent/extractor');
          const tier3Extractor = new IntentExtractor(gitOps);
          tier3RawContext = await tier3Extractor.extract(branch, metrics, { skipPrompt: true });
        } catch (e) {
          logger.warn(`Could not extract context for Tier 3 report: ${e.message}`);
        }

        await diagnosticReporter.generateReport(branch, classification, metrics, tier3RawContext, mergeAnalysis);

        spinner.succeed(chalk.green('Resolution report ready'));
        console.log(chalk.green(`\n📋 Diagnostic report: ${diagnosticReporter.reportPath}\n`));
        process.exit(1);
      }

      // TIER 1: Minor - Direct merge (low divergence, no Bob needed)
      if (classification.tier === 1) {
        spinner = ora('Tier 1: Performing direct semantic merge...').start();

        try {
          // Direct merge — no replay needed for low-divergence branches
          await gitOps.git.merge([branch, '--no-ff', '-m', `Merge ${branch} via Peacemaker (Tier 1)`]);
          spinner.succeed(chalk.green('Tier 1 merge complete'));

          console.log(chalk.bold('\n' + '═'.repeat(68)));
          console.log(chalk.bold(chalk.cyan('  PEACEMAKER — TIER 1 MERGE COMPLETE')));
          console.log(chalk.bold('═'.repeat(68)));
          console.log('');
          console.log(chalk.bold('  Branch:    ') + chalk.cyan(branch));
          console.log(chalk.bold('  Strategy:  ') + chalk.white('Direct merge (low divergence)'));
          console.log(chalk.bold('  Conflicts: ') + chalk.green('None'));
          console.log(chalk.bold('  Status:    ') + chalk.green('✓ Merged successfully'));
          console.log('');

          // Generate changelog
          spinner = ora('Generating changelog...').start();
          const tier1Intent = { summary: `Direct merge of ${branch}`, goals: [], keyChanges: [], technicalApproach: 'Direct git merge (Tier 1 fast-path)', confidence: 'high' };
          const tier1Result = { success: true, attempt: 1, appliedChanges: [], verification: { passed: true } };
          await changelogGenerator.generate(branch, tier1Intent, tier1Result, classification);

          const tier1ChangelogStatus = await gitOps.git.raw(['status', '--porcelain', '--', changelogGenerator.changelogPath]);
          if (tier1ChangelogStatus.trim()) {
            await gitOps.git.add([changelogGenerator.changelogPath]);
            await gitOps.git.commit(`docs: update Peacemaker changelog for ${branch}`);
            logger.info('Tier 1 changelog committed');
          }

          spinner.succeed(chalk.green('Changelog updated'));

          console.log(chalk.green(`\n✓ Branch ${branch} merged into ${defaultBranch} (Tier 1 fast-path)\n`));
          console.log(chalk.gray('Made with Bob 🤖\n'));
          process.exit(0);
        } catch (mergeError) {
          spinner.warn(chalk.yellow('Direct merge had conflicts — escalating to Tier 2 intent replay'));
          logger.warn(`Tier 1 merge failed: ${mergeError.message} — falling through to Tier 2`);
          // Abort the failed merge and fall through to Tier 2
          try { await gitOps.git.merge(['--abort']); } catch {}
        }
      }

      // TIER 2: Moderate - Intent replay workflow
      // ============================================
      // PRE-FLIGHT: Branch readiness check + developer intent
      // ============================================
      const readline = require('readline');

      // Show branch summary for pre-flight
      const headCommit = await gitOps.git.log([branch, '-1', '--format=%s|%h|%ar']);
      const headLine = headCommit.latest ? headCommit.latest.hash : '';
      // git log returns the full line as the hash field when using custom format
      const rawLog = await gitOps.git.raw(['log', branch, '-1', '--format=%s|%h|%ar']);
      const [commitMsg, shortHash, timeAgo] = rawLog.trim().split('|');

      console.log(chalk.bold('\n📋 Pre-flight Check'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.bold('  Branch:      ') + chalk.cyan(branch));
      console.log(chalk.bold('  Last commit: ') + chalk.white(`"${commitMsg}"`) + chalk.gray(` (${shortHash}, ${timeAgo})`));
      console.log(chalk.bold('  Files:       ') + chalk.white(changedFiles.slice(0, 3).join(', ') + (changedFiles.length > 3 ? ` (+${changedFiles.length - 3} more)` : '')));
      console.log(chalk.gray('─'.repeat(50)));

      // Pre-flight confirmation (always runs — safety gate)
      const preflightReady = await new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(chalk.bold('\nIs this branch committed and ready to merge? (Y/n): '), ans => {
          rl.close();
          resolve(ans.trim().toLowerCase() !== 'n');
        });
      });

      if (!preflightReady) {
        console.log(chalk.yellow('\n⚠ Merge aborted. Please commit your changes and try again.\n'));
        process.exit(0);
      }

      // Developer intent prompt (skippable with --skip-prompt, or press Enter to let Bob infer)
      let developerIntent = null;
      if (!options.skipPrompt) {
        developerIntent = await new Promise(resolve => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          console.log(chalk.gray('\nTip: Describing your intent helps Bob replay it more accurately.'));
          console.log(chalk.gray('     Press Enter to let Bob infer from commit history.'));
          rl.question(chalk.bold('💬 What was this branch trying to do? '), ans => {
            rl.close();
            resolve(ans.trim() || null);
          });
        });
        if (developerIntent) {
          console.log(chalk.green(`✓ Intent noted: "${developerIntent}"\n`));
        } else {
          console.log(chalk.gray('  Bob will infer intent from commit history.\n'));
        }
      }

      // ============================================
      // PHASES 4+5: Intent Extraction + Fresh Branch (parallel)
      // ============================================
      freshBranchName = `peacemaker-replay-${Date.now()}`;

      console.log(chalk.cyan('\n⚡ Running intent extraction and branch creation in parallel...'));

      // Phase 4+5 in parallel: gather raw git context AND create fresh branch
      const [rawContext] = await Promise.all([
        intentExtractor.extract(branch, metrics, { skipPrompt: true, developerInput: developerIntent }),
        gitOps.createBranchFromLatest(freshBranchName, defaultBranch)
      ]);

      console.log(chalk.green(`✓ Fresh branch created: ${freshBranchName}`));

      // Checkout the fresh branch so Bob writes to it
      await gitOps.git.checkout(freshBranchName);
      logger.info(`Checked out fresh branch: ${freshBranchName}`);

      // Phase 4b: Run Bob intent extraction on the raw context (uses cache if available)
      spinner = ora('Extracting semantic intent via Bob...').start();
      const BobClient = require('./bob/client');
      const bobClient = new BobClient();
      const intent = await bobClient.extractIntent(rawContext);
      if (intent._fromCache) {
        spinner.succeed(chalk.green('✓ Intent extracted') + chalk.gray(' (cache hit — Bob skipped)'));
      } else {
        spinner.succeed(chalk.green('✓ Intent extracted'));
      }
      logger.debug('Intent summary:', intentExtractor.buildSummary(rawContext));

      // ============================================
      // PHASE 6: Intent Replay with Retry
      // ============================================
      spinner = ora('Replaying intent onto fresh branch...').start();

      const replayResult = await intentReplay.replayWithRetry(intent, freshBranchName, rawContext);

      if (replayResult.success) {
        if (replayResult.retryNeeded) {
          spinner.succeed(chalk.green('Intent replayed (retry needed, self-corrected)'));
        } else {
          spinner.succeed(chalk.green('Intent replayed successfully'));
        }
      } else {
        spinner.warn(chalk.yellow('Intent replay completed with issues'));
      }

      logger.debug('Replay result:', intentReplay.buildSummary(replayResult));

      if (!replayResult.success) {
        console.log(chalk.red('\n✗ Replay verification failed. Approval is disabled for unsafe replay results.\n'));

        spinner = ora('Cleaning up...').start();
        try {
          await gitOps.git.raw(['checkout', '-f', defaultBranch]);
          await gitOps.git.deleteLocalBranch(freshBranchName, true);
          spinner.succeed(chalk.green('Cleanup complete'));
        } catch (error) {
          spinner.fail(chalk.red('Cleanup failed'));
          logger.warn(`Could not clean up branch: ${error.message}`);
        }

        approvalWorkflow.displayCancellation();
        process.exit(1);
      }

      // ============================================
      // PHASE 7: Automatic Backup Tag (always, before approval)
      // ============================================
      let backupTag = null;
      try {
        backupTag = `peacemaker-before-${branch.replace(/[^a-zA-Z0-9_-]/g, '-')}-${Date.now()}`;
        await gitOps.git.raw(['tag', backupTag, defaultBranch]);
        logger.info(`[Backup] Snapshot of ${defaultBranch} created: ${backupTag}`);
        console.log(chalk.gray(`  📦 Backup snapshot: ${backupTag} (points to ${defaultBranch})`));
        console.log(chalk.gray(`  ↩  To restore: git checkout ${defaultBranch} && git reset --hard ${backupTag}\n`));
      } catch (tagError) {
        logger.warn(`[Backup] Could not create backup tag: ${tagError.message}`);
      }

      // ============================================
      // PHASE 8: Admin Approval
      // ============================================
      const approved = await approvalWorkflow.prompt(classification, replayResult, intent, branch, backupTag);

      if (!approved) {
        // Clean up fresh branch
        spinner = ora('Cleaning up...').start();
        try {
          // Force checkout to base branch, discarding any uncommitted changes
          await gitOps.git.raw(['checkout', '-f', defaultBranch]);
          await gitOps.git.deleteLocalBranch(freshBranchName, true);
          spinner.succeed(chalk.green('Cleanup complete'));
        } catch (error) {
          spinner.fail(chalk.red('Cleanup failed'));
          logger.warn(`Could not clean up branch: ${error.message}`);
        }

        approvalWorkflow.displayCancellation();
        process.exit(0);
      }

      // ============================================
      // PHASE 8: Finalize Merge
      // ============================================
      spinner = ora('Finalizing merge...').start();

      try {
        // Ensure verified replay files are committed without sweeping unrelated files.
        const replayFiles = [...new Set(
          (replayResult.appliedChanges || [])
            .map(change => change && change.filePath)
            .filter(Boolean)
        )];

        if (replayFiles.length > 0) {
          const replayStatus = await gitOps.git.raw(['status', '--porcelain', '--', ...replayFiles]);
          if (replayStatus.trim()) {
            logger.debug(`Committing remaining verified replay files: ${replayFiles.join(', ')}`);
            await gitOps.git.add(replayFiles);
            await gitOps.git.commit('Peacemaker: Finalize replay changes');
          }
        }
        
        // Checkout main and merge the fresh branch
        await gitOps.git.checkout(defaultBranch);
        await gitOps.git.merge([freshBranchName, '--no-ff', '-m', `Merge ${branch} via Peacemaker`]);
        
        // Delete the fresh branch
        await gitOps.git.deleteLocalBranch(freshBranchName, true);
        
        spinner.succeed(chalk.green('Merge finalized'));

      } catch (error) {
        spinner.fail(chalk.red('Merge failed'));
        logger.error(`Failed to finalize merge: ${error.message}`);
        throw error;
      }

      // ============================================
      // PHASE 9: Generate Changelog
      // ============================================
      spinner = ora('Generating changelog...').start();

      await changelogGenerator.generate(branch, intent, replayResult, classification);

      const changelogStatus = await gitOps.git.raw(['status', '--porcelain', '--', changelogGenerator.changelogPath]);
      if (changelogStatus.trim()) {
        await gitOps.git.add([changelogGenerator.changelogPath]);
        await gitOps.git.commit(`docs: update Peacemaker changelog for ${branch}`);
        logger.info('Changelog committed');
      }

      spinner.succeed(chalk.green('Changelog updated'));

      // ============================================
      // SUCCESS!
      // ============================================
      approvalWorkflow.displaySuccess(branch);
      console.log(chalk.cyan(`📋 Changelog: ${changelogGenerator.changelogPath}`));
      console.log(chalk.gray('\nMade with Bob 🤖\n'));

    } catch (error) {
      if (spinner) {
        spinner.fail(chalk.red('Operation failed'));
      }
      
      logger.error(`Merge failed: ${error.message}`);
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      
      if (options.debug) {
        console.error(chalk.gray(error.stack));
      }

      // Clean up replay branch if one was created before the error
      if (freshBranchName) {
        try {
          const currentBranch = (await gitOps.git.branch()).current;
          if (defaultBranch && currentBranch !== defaultBranch) {
            await gitOps.git.raw(['checkout', '-f', defaultBranch]);
          }
          await gitOps.git.deleteLocalBranch(freshBranchName, true);
          console.log(chalk.gray(`  🧹 Cleaned up stale replay branch: ${freshBranchName}`));
          logger.info(`[Cleanup] Deleted stale replay branch: ${freshBranchName}`);
        } catch (cleanupErr) {
          logger.warn(`[Cleanup] Could not delete replay branch ${freshBranchName}: ${cleanupErr.message}`);
        }
      }

      process.exit(1);
    }
  });

// Add stats command
program.command('stats')
  .description('Show Peacemaker merge statistics')
  .action(async () => {
    try {
      const summary = await changelogGenerator.generateSummary();
      
      if (summary) {
        console.log('\n' + chalk.bold(chalk.cyan('📊 Peacemaker Statistics\n')));
        console.log(changelogGenerator.formatSummary(summary));
        console.log('');
      } else {
        console.log(chalk.yellow('\nNo merge history found.\n'));
      }

    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Add history command
program.command('history')
  .description('Show recent merge history')
  .option('-n, --count <number>', 'Number of entries to show', '5')
  .action(async (options) => {
    try {
      const count = parseInt(options.count);
      const entries = await changelogGenerator.getRecentEntries(count);
      
      if (entries.length > 0) {
        console.log('\n' + chalk.bold(chalk.cyan('📜 Recent Merges\n')));
        entries.forEach((entry, index) => {
          console.log(chalk.gray('─'.repeat(70)));
          console.log(entry);
          if (index < entries.length - 1) console.log('');
        });
        console.log(chalk.gray('─'.repeat(70)) + '\n');
      } else {
        console.log(chalk.yellow('\nNo merge history found.\n'));
      }

    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Add analyze command
program.command('analyze')
  .description('Analyze a branch and generate an AI-powered report without merging')
  .argument('<branch>', 'Branch to analyze')
  .option('-b, --base <branch>', 'Base branch to compare against (defaults to current branch)')
  .option('-d, --debug', 'Output extra debugging information')
  .action(async (branch, options) => {
    let spinner;
    try {
      if (options.debug) logger.setLevel('debug');

      console.log(chalk.bold(chalk.cyan('\n🔍 PEACEMAKER - Branch Analysis\n')));
      logger.info(`Analyzing branch: ${branch}`);

      const defaultBranch = options.base || (await gitOps.git.branch()).current;
      logger.info(`Base branch: ${defaultBranch}`);

      // Phase 1: Git metrics
      spinner = ora('Analyzing branch divergence...').start();
      const [commitsBehind, commitsAhead, changedFiles, conflictingFiles] = await Promise.all([
        gitOps.getCommitsBehind(branch, defaultBranch),
        gitOps.getCommitsAhead(branch, defaultBranch),
        gitOps.getChangedFiles(branch, defaultBranch),
        gitOps.getConflictingFiles(branch, defaultBranch)
      ]);
      const metrics = { commitsBehind, commitsAhead, changedFiles, conflictingFiles };
      spinner.succeed('Branch analysis complete');
      logger.info(`Branch is ${commitsBehind} behind, ${commitsAhead} ahead`);

      // Phase 2: Classification (for context only — no merge gating)
      spinner = ora('Classifying divergence...').start();
      const classification = classifier.classify(metrics);
      spinner.succeed(`Classified as Tier ${classification.tier}`);

      // Phase 3: Merge analysis report (terminal)
      spinner = ora('Building merge analysis...').start();
      const mergeAnalysis = await mergeAnalyzer.analyze(defaultBranch, branch, metrics, classification);
      spinner.succeed('Merge analysis complete');
      mergeAnalyzer.printTerminalReport(mergeAnalysis, classification);

      // Phase 4: Extract raw context for Bob
      spinner = ora('Generating AI branch analysis — this may take a moment...').start();
      let rawContext = null;
      try {
        rawContext = await intentExtractor.extract(branch, metrics, { skipPrompt: true });
      } catch (e) {
        logger.warn(`Could not extract raw context: ${e.message}`);
      }

      // Phase 5: Generate diagnostic report (reuse Tier 3 reporter)
      const reportPath = await diagnosticReporter.generateReport(branch, classification, metrics, rawContext, mergeAnalysis, { useCache: true });
      spinner.succeed(chalk.green('AI analysis complete'));

      console.log(chalk.green(`\n📋 Analysis report: ${reportPath}\n`));

    } catch (error) {
      if (spinner) spinner.fail(chalk.red('Analysis failed'));
      logger.error(`Analysis failed: ${error.message}`);
      console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Parse CLI arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

// Made with Bob
