import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import readline from 'readline';
import {
  getBranchDivergence,
  findForkPoint,
  getChangedFiles,
  getConflictingFiles,
  getCurrentBranch,
  getLocalBranches,
  checkoutBranch,
  deleteBranch,
  createBranchFromLatest,
  mergeBranch,
  createTag,
  getRecentCommit,
} from './git/operations.js';
import { classifyMerge } from './classifier/divergence.js';
import { extractIntent } from './intent/extractor.js';
import { buildMergeAnalysis, formatAnalysisForTerminal } from './diagnostics/analyzer.js';
import { generateReport } from './diagnostics/reporter.js';
import { replayIntent } from './bob/replay.js';
import { showMergeSummary, showTier3Refusal, showTier1Complete } from './approval/workflow.js';
import { appendToChangelog, readChangelogStats, readChangelogHistory } from './changelog/generator.js';
import logger from './utils/logger.js';
import fs from 'fs';
import simpleGit from 'simple-git';

dotenv.config();

const git = simpleGit();

export async function runMerge(featureBranch, options) {
  // Variables hoisted for catch block access
  let freshBranchName = null;
  let defaultBranch = null;
  let backupTag = null;
  
  const spinner = ora();
  
  try {
    console.log('');
    console.log(chalk.bold('⚔️  PEACEMAKR - Semantic Merge Resolution'));
    console.log('');
    
    // Stale branch guard
    const currentBranch = await getCurrentBranch();
    if (currentBranch.startsWith('peacemakr-replay-')) {
      logger.warn(`Stale replay branch detected: ${currentBranch}`);
      const localBranches = await getLocalBranches();
      const candidates = ['main', 'master', 'trunk', 'develop', 'dev'];
      const realBase = candidates.find(c => localBranches.includes(c));
      
      if (!realBase) {
        console.error(chalk.red('Could not find a standard base branch. Please checkout manually.'));
        process.exit(1);
      }
      
      await checkoutBranch(realBase);
      await deleteBranch(currentBranch, true);
      console.log(chalk.green(`Cleaned up stale replay branch. Now on: ${realBase}`));
    }
    
    // Determine base branch
    defaultBranch = options.base || await getCurrentBranch();
    
    // Phase 1: Branch analysis
    spinner.start('Analyzing branch...');
    const divergence = await getBranchDivergence(featureBranch, defaultBranch);
    const forkPoint = await findForkPoint(featureBranch, defaultBranch);
    const changedFiles = await getChangedFiles(featureBranch, defaultBranch);
    const conflictingFiles = await getConflictingFiles(featureBranch, defaultBranch);
    spinner.succeed('Branch analysis complete');
    
    logger.info(`Branch is ${divergence.behind} behind, ${divergence.ahead} ahead`);
    
    // Phase 2: Classification
    spinner.start('Classifying merge complexity...');
    const classification = classifyMerge({
      behind: divergence.behind,
      ahead: divergence.ahead,
      changedFiles,
      conflictingFiles,
      forkPoint,
    });
    spinner.succeed(`Classified as Tier ${classification.tier}`);
    
    logger.info(`Tier ${classification.tier}: ${classification.reason}`);
    
    // Phase 3: Merge analysis
    spinner.start('Building merge analysis...');
    const mergeAnalysis = await buildMergeAnalysis(featureBranch, defaultBranch, classification);
    spinner.succeed('Merge analysis complete');
    
    console.log(formatAnalysisForTerminal(mergeAnalysis));
    
    // Handle different tiers
    if (classification.tier === 1) {
      return await _handleTier1Merge(featureBranch, defaultBranch, classification, divergence);
    } else if (classification.tier === 2) {
      return await _handleTier2Merge(
        featureBranch,
        defaultBranch,
        classification,
        divergence,
        mergeAnalysis,
        options,
        spinner
      );
    } else {
      // Tier 3
      return await _handleTier3Analysis(
        featureBranch,
        defaultBranch,
        mergeAnalysis,
        spinner
      );
    }
  } catch (error) {
    spinner.fail('Operation failed');
    logger.error(error.message);
    
    // Cleanup on error
    if (freshBranchName && defaultBranch) {
      try {
        await checkoutBranch(defaultBranch);
        await deleteBranch(freshBranchName, true);
        logger.info('Cleaned up replay branch after error');
      } catch (cleanupError) {
        logger.warn(`Could not cleanup: ${cleanupError.message}`);
      }
    }
    
    process.exit(1);
  }
}

async function _handleTier1Merge(featureBranch, baseBranch, classification, divergence) {
  try {
    // Direct merge with --no-ff
    await git.merge([featureBranch, '--no-ff', '-m', `Merge ${featureBranch} via Peacemakr (Tier 1)`]);
    
    showTier1Complete(featureBranch);
    
    // Generate changelog
    await appendToChangelog({
      featureBranch,
      baseBranch,
      tier: 1,
      classification,
      intent: { summary: 'Direct merge (low divergence)', confidence: 'high' },
      filesModified: [],
      overlappingFiles: [],
      preservedFiles: [],
      deletedFiles: [],
      verificationPassed: true,
      backupTag: null,
    });
    
    console.log(chalk.green('✓ Merge completed successfully!'));
    console.log(`Branch ${featureBranch} has been merged into ${baseBranch}.`);
    console.log(chalk.bold('📋 Changelog: PEACEMAKR_CHANGELOG.md'));
    console.log('');
    console.log(chalk.gray('                        Made with Bob 🤖'));
    console.log('');
  } catch (error) {
    logger.error(`Tier 1 merge failed: ${error.message}`);
    throw error;
  }
}

async function _handleTier2Merge(
  featureBranch,
  baseBranch,
  classification,
  divergence,
  mergeAnalysis,
  options,
  spinner
) {
  // Phase 4: Pre-flight check
  const recentCommit = await getRecentCommit(featureBranch);
  const fileCount = mergeAnalysis.featureChanges.added.length + 
                    mergeAnalysis.featureChanges.modified.length;
  const fileList = [
    ...mergeAnalysis.featureChanges.added.slice(0, 3),
    ...mergeAnalysis.featureChanges.modified.slice(0, 3),
  ];
  
  console.log(chalk.bold('📋 Pre-flight Check'));
  console.log('──────────────────────────────────────────────────');
  console.log(`  Branch:      ${featureBranch}`);
  console.log(`  Last commit: "${recentCommit.message}" (${recentCommit.hash}, ${recentCommit.timeAgo})`);
  console.log(`  Files:       ${fileList.join(', ')}${fileCount > 3 ? ` (+${fileCount - 3} more)` : ''}`);
  console.log('──────────────────────────────────────────────────');
  console.log('');
  
  const ready = await _promptYesNo('Is this branch committed and ready to merge? (Y/n): ', true);
  
  if (!ready) {
    console.log(chalk.yellow('Merge cancelled. No changes made.'));
    process.exit(0);
  }
  
  // Phase 5: Intent prompt (unless --skip-prompt)
  let userDescription = null;
  if (!options.skipPrompt) {
    console.log('');
    console.log(chalk.bold('💬 What was this branch trying to do?'));
    userDescription = await _promptInput('Press Enter to let Bob infer from commit history.\n> ');
  }
  
  // Phase 6: Parallel - intent extraction + fresh branch creation
  console.log('');
  console.log(chalk.bold('⚡ Running intent extraction and branch creation in parallel...'));
  console.log('');
  
  const freshBranchName = `peacemakr-replay-${Date.now()}`;
  
  const [rawContext] = await Promise.all([
    extractIntent(featureBranch, baseBranch, userDescription),
    createBranchFromLatest(freshBranchName, baseBranch).then(() => {
      console.log(chalk.green(`✓ Fresh branch created: ${freshBranchName}`));
    }),
  ]);
  
  console.log(chalk.green('✔ ✓ Intent extracted'));
  console.log('');
  
  // Phase 7: Replay intent
  spinner.start('Replaying intent onto fresh branch...');
  const replayResult = await replayIntent(rawContext, {
    featureBranch,
  });
  spinner.succeed('Intent replayed successfully');
  
  // Phase 8: Create backup tag
  const backupTag = `peacemakr-before-${featureBranch.replace(/\//g, '-')}-${Date.now()}`;
  await checkoutBranch(baseBranch);
  await createTag(backupTag, 'HEAD');
  
  console.log('');
  console.log(chalk.bold(`📦 Backup snapshot: ${backupTag} (points to ${baseBranch})`));
  console.log(chalk.gray(`↩ To restore: git checkout ${baseBranch} && git reset --hard ${backupTag}`));
  console.log('');
  
  // Phase 9: Show merge summary + approval
  const approved = await showMergeSummary({
    featureBranch,
    classification,
    divergence,
    intent: rawContext.intent,
    replayResult,
    rawContext,
    backupTag,
  });
  
  if (!approved) {
    console.log('');
    console.log(chalk.yellow('Merge cancelled.'));
    await checkoutBranch(baseBranch);
    await deleteBranch(freshBranchName, true);
    process.exit(0);
  }
  
  // Phase 10: Merge replay branch into base
  spinner.start('Finalizing merge...');
  await mergeBranch(freshBranchName, baseBranch, featureBranch);
  spinner.succeed('Merge finalized');
  
  // Phase 11: Delete replay branch
  await deleteBranch(freshBranchName, true);
  
  // Phase 12: Generate changelog
  spinner.start('Updating changelog...');
  await appendToChangelog({
    featureBranch,
    baseBranch,
    tier: 2,
    classification,
    intent: rawContext.intent,
    filesModified: replayResult.filesModified,
    overlappingFiles: replayResult.overlappingFiles,
    preservedFiles: rawContext._preservedFiles,
    deletedFiles: rawContext.deletedFiles,
    verificationPassed: replayResult.verificationPassed,
    backupTag,
  });
  spinner.succeed('Changelog updated');
  
  console.log('');
  console.log(chalk.green('✓ Merge completed successfully!'));
  console.log(`Branch ${featureBranch} has been merged into ${baseBranch}.`);
  console.log(chalk.bold('📋 Changelog: PEACEMAKR_CHANGELOG.md'));
  console.log('');
  console.log(chalk.gray('                        Made with Bob 🤖'));
  console.log('');
}

async function _handleTier3Analysis(featureBranch, baseBranch, mergeAnalysis, spinner) {
  showTier3Refusal();
  
  spinner.start('Generating detailed resolution report — this may take a moment...');
  
  // Extract raw context for Bob
  const rawContext = await extractIntent(featureBranch, baseBranch, null);
  
  // Generate diagnostic report (3 parallel Bob calls)
  const report = await generateReport(mergeAnalysis, rawContext, { useCache: false });
  
  spinner.text = 'Finalizing report...';
  
  // Write report
  fs.writeFileSync('PEACEMAKR_DIAGNOSTIC_REPORT.md', report, 'utf8');
  
  spinner.succeed('Resolution report ready');
  
  console.log('');
  console.log(chalk.bold('📋 Diagnostic report: PEACEMAKR_DIAGNOSTIC_REPORT.md'));
  console.log('');
  console.log(chalk.gray('                        Made with Bob 🤖'));
  console.log('');
}

export async function runAnalyze(featureBranch, options) {
  const spinner = ora();
  
  try {
    console.log('');
    console.log(chalk.bold('🔍 PEACEMAKR - Branch Analysis'));
    console.log('');
    
    const baseBranch = options.base || await getCurrentBranch();
    
    // Phase 1: Branch analysis
    spinner.start('Analyzing branch...');
    const divergence = await getBranchDivergence(featureBranch, baseBranch);
    const forkPoint = await findForkPoint(featureBranch, baseBranch);
    const changedFiles = await getChangedFiles(featureBranch, baseBranch);
    const conflictingFiles = await getConflictingFiles(featureBranch, baseBranch);
    spinner.succeed('Branch analysis complete');
    
    // Phase 2: Classification
    const classification = classifyMerge({
      behind: divergence.behind,
      ahead: divergence.ahead,
      changedFiles,
      conflictingFiles,
      forkPoint,
    });
    
    console.log(chalk.bold(`Classification: Tier ${classification.tier} (${classification.reason})`));
    console.log('');
    
    // Phase 3: Merge analysis
    const mergeAnalysis = await buildMergeAnalysis(featureBranch, baseBranch, classification);
    console.log(formatAnalysisForTerminal(mergeAnalysis));
    
    // Phase 4: Extract raw context
    spinner.start('Extracting branch context...');
    const rawContext = await extractIntent(featureBranch, baseBranch, null);
    spinner.succeed('Context extracted');
    
    // Phase 5: Generate report with cache
    spinner.start('Generating analysis report (using cache if available)...');
    const report = await generateReport(mergeAnalysis, rawContext, { useCache: true });
    spinner.succeed('Analysis complete');
    
    // Phase 6: Write report
    fs.writeFileSync('PEACEMAKR_DIAGNOSTIC_REPORT.md', report, 'utf8');
    
    console.log('');
    console.log(chalk.green('✔ Analysis complete. Report: PEACEMAKR_DIAGNOSTIC_REPORT.md'));
    console.log('');
    console.log(chalk.gray('                        Made with Bob 🤖'));
    console.log('');
  } catch (error) {
    spinner.fail('Analysis failed');
    logger.error(error.message);
    process.exit(1);
  }
}

export async function runStats() {
  try {
    const stats = readChangelogStats();
    
    console.log('');
    console.log(chalk.bold('📊 Peacemakr Statistics'));
    console.log(`  Total Merges:         ${stats.totalMerges}`);
    console.log(`  Tier 1 (Minor):        ${stats.tier1}`);
    console.log(`  Tier 2 (Moderate):     ${stats.tier2}`);
    console.log(`  Tier 3 (Critical):     ${stats.tier3}`);
    console.log(`  Retries Needed:        ${stats.retriesNeeded}`);
    console.log(`  Verification Passed:  ${stats.verificationPassed}`);
    console.log(`  Verification Failed:   ${stats.verificationFailed}`);
    console.log('');
  } catch (error) {
    logger.error(`Failed to read stats: ${error.message}`);
    process.exit(1);
  }
}

export async function runHistory(options) {
  try {
    const count = parseInt(options.count || '5', 10);
    const entries = readChangelogHistory(count);
    
    console.log('');
    console.log(chalk.bold(`📜 Recent Merge History (last ${count})`));
    console.log('');
    
    if (entries.length === 0) {
      console.log(chalk.gray('No merge history found.'));
    } else {
      for (const entry of entries) {
        console.log(entry);
        console.log('');
      }
    }
  } catch (error) {
    logger.error(`Failed to read history: ${error.message}`);
    process.exit(1);
  }
}

async function _promptYesNo(question, defaultYes = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      
      if (!answer.trim()) {
        resolve(defaultYes);
      } else {
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      }
    });
  });
}

async function _promptInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() || null);
    });
  });
}

// Made with Bob
