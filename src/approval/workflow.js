import readline from 'readline';
import chalk from 'chalk';
import logger from '../utils/logger.js';

export async function showMergeSummary(options) {
  const {
    featureBranch,
    classification,
    divergence,
    intent,
    replayResult,
    rawContext,
    backupTag,
  } = options;
  
  console.log('');
  console.log(chalk.bold('╔════════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold('║                    PEACEMAKR MERGE SUMMARY                        ║'));
  console.log(chalk.bold('╚════════════════════════════════════════════════════════════════════╝'));
  console.log('');
  
  console.log(chalk.bold(`Branch: ${featureBranch}`));
  console.log(chalk.bold('Classification:'));
  console.log(`  Tier: ${classification.tier} (${classification.reason})`);
  console.log(`  Risk Level: ${classification.riskLevel}`);
  console.log('');
  
  console.log(chalk.bold('Divergence Metrics:'));
  console.log(`  ${divergence.behind} commits behind ${rawContext.baseBranch}`);
  console.log(`  ${divergence.ahead} commits ahead of ${rawContext.baseBranch}`);
  console.log(`  ${rawContext.changedFiles.length} files modified`);
  console.log(`  ${replayResult.overlappingFiles.length} potential conflicts`);
  console.log('');
  
  console.log(chalk.bold('Risk Scores:'));
  console.log(`  • Divergence: ${classification.scores.divergence}/100`);
  console.log(`  • Complexity: ${classification.scores.complexity}/100`);
  console.log(`  • Conflict:   ${classification.scores.conflict}/100`);
  console.log(`  • Overall:    ${classification.scores.overall}/100`);
  console.log('');
  
  console.log(chalk.bold('Intent Extracted:'));
  console.log(`  "${intent.summary}"`);
  console.log(`  Confidence: ${intent.confidence}`);
  if (intent.goals && intent.goals.length > 0) {
    console.log('  Goals:');
    for (const goal of intent.goals) {
      console.log(`    • ${goal}`);
    }
  }
  console.log('');
  
  console.log(chalk.bold('Replay Status:'));
  console.log(`  ${chalk.green('✓')} Intent replayed successfully`);
  console.log(`  • Attempts: ${replayResult.attempts || 1}`);
  if (replayResult.verificationPassed) {
    console.log(`  ${chalk.green('✓')} Passed verification on first attempt`);
  } else {
    console.log(`  ${chalk.yellow('⚠')} Verification warnings (see log)`);
  }
  console.log('');
  
  // Categorize files
  const added = [];
  const modified = [];
  const preserved = rawContext._preservedFiles || [];
  const deleted = rawContext.deletedFiles || [];
  const missing = [];
  
  for (const file of replayResult.filesModified) {
    if (replayResult.overlappingFiles.includes(file)) {
      modified.push(file);
    } else if (!rawContext.changedFiles.includes(file)) {
      preserved.push(file);
    } else {
      added.push(file);
    }
  }
  
  // Check for expected but missing files
  for (const file of rawContext.changedFiles) {
    if (!replayResult.filesModified.includes(file) && !deleted.includes(file)) {
      missing.push(file);
    }
  }
  
  if (added.length > 0) {
    console.log(chalk.bold('Added:'));
    for (const file of added.slice(0, 10)) {
      console.log(`  ${chalk.green('+')} ${file}`);
    }
    if (added.length > 10) {
      console.log(`  ... and ${added.length - 10} more`);
    }
    console.log('');
  }
  
  if (modified.length > 0) {
    console.log(chalk.bold('Modified:'));
    for (const file of modified.slice(0, 10)) {
      console.log(`  ${chalk.yellow('~')} ${file}`);
    }
    if (modified.length > 10) {
      console.log(`  ... and ${modified.length - 10} more`);
    }
    console.log('');
  }
  
  if (preserved.length > 0) {
    console.log(chalk.bold('Preserved (from base):'));
    for (const file of preserved.slice(0, 10)) {
      console.log(`  ${chalk.gray('=')} ${file}`);
    }
    if (preserved.length > 10) {
      console.log(`  ... and ${preserved.length - 10} more`);
    }
    console.log('');
  }
  
  if (deleted.length > 0) {
    console.log(chalk.bold('Deleted (feature branch removed):'));
    for (const file of deleted.slice(0, 10)) {
      console.log(`  ${chalk.red('-')} ${file}`);
    }
    if (deleted.length > 10) {
      console.log(`  ... and ${deleted.length - 10} more`);
    }
    console.log('');
  }
  
  if (missing.length > 0) {
    console.log(chalk.bold('Missing (expected but not written):'));
    for (const file of missing.slice(0, 10)) {
      console.log(`  ${chalk.red('?')} ${file}`);
    }
    if (missing.length > 10) {
      console.log(`  ... and ${missing.length - 10} more`);
    }
    console.log('');
  }
  
  console.log(chalk.bold('Verification:'));
  if (replayResult.verificationPassed) {
    console.log(`  ${chalk.green('✓')} All checks passed`);
    console.log(`  Confidence: ${intent.confidence}`);
  } else {
    console.log(`  ${chalk.yellow('⚠')} Some checks failed (see log)`);
    console.log(`  Confidence: ${intent.confidence}`);
  }
  console.log('');
  
  console.log(chalk.bold('📂 Review changes before approving:'));
  console.log(`git diff ${backupTag}..HEAD`);
  console.log(`(or for a specific file: git diff ${backupTag}..HEAD -- <file>)`);
  console.log('');
  
  // Prompt for approval
  const approved = await _promptApproval();
  
  return approved;
}

export function showTier3Refusal() {
  console.log('');
  console.log(chalk.yellow('⚠  Merge not possible — branch divergence is too high for automated resolution'));
  console.log('');
  console.log('Peacemakr has analysed the branch and is generating a detailed report to guide manual resolution.');
  console.log('');
}

export function showTier1Complete(featureBranch) {
  console.log('');
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(chalk.bold('                    PEACEMAKR — TIER 1 MERGE COMPLETE'));
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Branch:   ${featureBranch}`);
  console.log('  Strategy: Direct merge (low divergence)');
  console.log('  Conflicts: None');
  console.log(`  Status:   ${chalk.green('✓')} Merged successfully`);
  console.log('');
}

async function _promptApproval() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(chalk.bold('Approve this merge? (y/N): '), (answer) => {
      rl.close();
      
      const approved = answer.toLowerCase() === 'y';
      
      if (approved) {
        logger.info('Merge approved by admin');
      } else {
        logger.info('Merge cancelled by admin');
      }
      
      resolve(approved);
    });
  });
}

// Made with Bob
