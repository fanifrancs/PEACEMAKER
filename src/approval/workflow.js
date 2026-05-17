
const readline = require('readline');
const chalk = require('../utils/colors');
const logger = require('../utils/logger');

/**
 * Admin Approval Workflow - Interactive approval interface
 * Displays comprehensive summary and prompts admin for approval
 */
class ApprovalWorkflow {
  /**
   * Prompt admin for merge approval
   * @param {Object} classification - Divergence classification result
   * @param {Object} replayResult - Intent replay result
   * @param {Object} intent - Extracted intent
   * @returns {Promise<boolean>} True if approved, false if rejected
   */
  async prompt(classification, replayResult, intent, branch, backupTag) {
    console.log('\n');
    this._displayHeader();
    this._displayBranchInfo(intent, branch);
    this._displayClassification(classification);
    this._displayIntentSummary(intent, replayResult);
    this._displayReplayStatus(replayResult);
    this._displayChangedFiles(replayResult);
    this._displayVerification(replayResult);
    
    console.log('\n');
    if (backupTag) {
      console.log(chalk.bold('📂 Review changes before approving:'));
      console.log(chalk.cyan('   git diff ' + backupTag + '..HEAD'));
      console.log(chalk.gray('   (or for a specific file: git diff ' + backupTag + '..HEAD -- <file>)'));
      console.log('');
    }

    try {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => {
        rl.question(chalk.bold(chalk.yellow('Approve this merge? (y/N): ')), ans => {
          rl.close();
          resolve(ans.trim().toLowerCase());
        });
      });
      if (answer === 'y' || answer === 'yes') {
        logger.info('Merge approved by admin');
        return true;
      } else {
        logger.info('Merge rejected by admin');
        return false;
      }
    } catch (error) {
      logger.warn('Approval prompt cancelled');
      return false;
    }
  }

  /**
   * Display header
   * @private
   */
  _displayHeader() {
    const width = 70;
    console.log(chalk.cyan('╔' + '═'.repeat(width - 2) + '╗'));
    console.log(chalk.cyan('║') + chalk.bold(chalk.white(' '.repeat(15) + 'PEACEMAKER MERGE SUMMARY' + ' '.repeat(15))) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(width - 2) + '╝'));
  }

  /**
   * Display branch information
   * @private
   */
  _displayBranchInfo(intent, branch) {
    console.log('\n' + chalk.bold('Branch:'), chalk.cyan(branch || intent.branch || 'unknown'));
    if (intent.prTitle) {
      console.log(chalk.bold('PR Title:'), intent.prTitle);
    }
  }

  /**
   * Display classification information
   * @private
   */
  _displayClassification(classification) {
    console.log('\n' + chalk.bold('Classification:'));
    
    const tierColor = classification.tier === 1 ? chalk.green : 
                     classification.tier === 2 ? chalk.yellow : 
                     chalk.red;
    
    console.log('  ' + chalk.bold('Tier:'), tierColor(`${classification.tier} (${classification.reasoning.summary})`));
    console.log('  ' + chalk.bold('Risk Level:'), this._colorizeRisk(classification.reasoning.riskLevel));
    
    console.log('\n' + chalk.bold('Divergence Metrics:'));
    console.log('  • ' + chalk.gray(`${classification.metrics.commitsBehind} commits behind main`));
    console.log('  • ' + chalk.gray(`${classification.metrics.commitsAhead} commits ahead of main`));
    console.log('  • ' + chalk.gray(`${classification.metrics.changedFilesCount} files modified`));
    console.log('  • ' + chalk.gray(`${classification.metrics.conflictingFilesCount} potential conflicts`));

    if (classification.scores) {
      console.log('\n' + chalk.bold('Risk Scores:'));
      console.log('  • Divergence:', this._colorizeScore(classification.scores.divergence));
      console.log('  • Complexity:', this._colorizeScore(classification.scores.complexity));
      console.log('  • Conflict:', this._colorizeScore(classification.scores.conflict));
      console.log('  • Overall:', this._colorizeScore(classification.scores.overall));
    }
  }

  /**
   * Display intent summary
   * @private
   */
  _displayIntentSummary(intent, replayResult) {
    console.log('\n' + chalk.bold('Intent Extracted:'));
    
    if (replayResult.extractedIntent) {
      console.log('  ' + chalk.italic(`"${replayResult.extractedIntent.summary}"`));
      console.log('  ' + chalk.gray(`Confidence: ${replayResult.extractedIntent.confidence}`));
      
      if (replayResult.extractedIntent.goals && replayResult.extractedIntent.goals.length > 0) {
        console.log('\n  ' + chalk.bold('Goals:'));
        replayResult.extractedIntent.goals.forEach(goal => {
          console.log('    • ' + chalk.gray(goal));
        });
      }
    }

    if (intent.developerInput) {
      console.log('\n  ' + chalk.bold('Developer Input:'));
      console.log('    ' + chalk.gray(`"${intent.developerInput}"`));
    }
  }

  /**
   * Display replay status
   * @private
   */
  _displayReplayStatus(replayResult) {
    console.log('\n' + chalk.bold('Replay Status:'));
    
    if (replayResult.success) {
      console.log('  ' + chalk.green('✓ Intent replayed successfully'));
    } else {
      console.log('  ' + chalk.red('✗ Intent replay encountered issues'));
    }

    console.log('  • Attempts:', replayResult.attempt);
    
    if (replayResult.retryNeeded) {
      console.log('  ' + chalk.yellow('⚠ Self-check required retry'));
      
      if (replayResult.errorContext) {
        console.log('    ' + chalk.gray(`Root cause: ${replayResult.errorContext.rootCause}`));
        console.log('    ' + chalk.gray(`Fix applied: ${replayResult.errorContext.fixStrategy}`));
      }
    } else {
      console.log('  ' + chalk.green('✓ Passed verification on first attempt'));
    }
  }

  /**
   * Display changed files
   * @private
   */
  _displayChangedFiles(replayResult) {
    if (!replayResult.appliedChanges || replayResult.appliedChanges.length === 0) {
      return;
    }

    const allChanges = replayResult.appliedChanges;
    const created   = allChanges.filter(c => c.operation === 'create');
    const modified  = allChanges.filter(c => c.operation === 'modify');
    const preserved = allChanges.filter(c => c.operation === 'preserve');
    const deleted   = allChanges.filter(c => c.operation === 'delete');
    const missing   = allChanges.filter(c => c.operation === 'missing');

    const printGroup = (label, icon, files) => {
      if (files.length === 0) return;
      console.log('\n' + chalk.bold(label));
      const maxDisplay = 10;
      files.slice(0, maxDisplay).forEach(c => console.log(`  ${icon} ${chalk.gray(c.filePath)}`));
      if (files.length > maxDisplay) console.log(`  ${chalk.gray(`... and ${files.length - maxDisplay} more`)}`);
    };

    printGroup('Added:',    chalk.green('+'),    created);
    printGroup('Modified:', chalk.yellow('~'),   modified);
    printGroup('Preserved (from base):', chalk.gray('='), preserved);
    printGroup('Deleted (feature branch removed):', chalk.red('-'), deleted);
    printGroup('Missing (expected but not written):', chalk.red('?'), missing);
  }

  /**
   * Display verification results
   * @private
   */
  _displayVerification(replayResult) {
    if (!replayResult.verification) {
      return;
    }

    console.log('\n' + chalk.bold('Verification:'));
    
    if (replayResult.verification.passed) {
      console.log('  ' + chalk.green('✓ All checks passed'));
      console.log('  ' + chalk.gray(`Confidence: ${replayResult.verification.confidence}`));
    } else {
      console.log('  ' + chalk.red('✗ Issues detected'));
      
      if (replayResult.verification.issues && replayResult.verification.issues.length > 0) {
        console.log('\n  ' + chalk.bold('Issues Found:'));
        replayResult.verification.issues.slice(0, 5).forEach(issue => {
          const severity = issue.severity === 'error' ? chalk.red('ERROR') : chalk.yellow('WARNING');
          console.log(`    ${severity}: ${chalk.gray(issue.file)}`);
          console.log(`      ${chalk.gray(issue.description)}`);
          if (issue.suggestion) {
            console.log(`      ${chalk.cyan('→ ' + issue.suggestion)}`);
          }
        });

        if (replayResult.verification.issues.length > 5) {
          console.log(`    ${chalk.gray(`... and ${replayResult.verification.issues.length - 5} more issues`)}`);
        }
      }
    }

    if (replayResult.verification.warnings && replayResult.verification.warnings.length > 0) {
      console.log('\n  ' + chalk.bold('Warnings:'));
      replayResult.verification.warnings.slice(0, 3).forEach(warning => {
        console.log('    ' + chalk.yellow('⚠ ') + chalk.gray(warning));
      });
    }
  }

  /**
   * Colorize risk level
   * @private
   */
  _colorizeRisk(riskLevel) {
    switch (riskLevel) {
      case 'LOW':
        return chalk.green(riskLevel);
      case 'MODERATE':
        return chalk.yellow(riskLevel);
      case 'HIGH':
        return chalk.red(riskLevel);
      default:
        return chalk.gray(riskLevel);
    }
  }

  /**
   * Colorize score (0-100)
   * @private
   */
  _colorizeScore(score) {
    const color = score < 30 ? chalk.green :
                  score < 70 ? chalk.yellow :
                  chalk.red;
    return color(`${score}/100`);
  }

  /**
   * Display cancellation message
   */
  displayCancellation() {
    console.log('\n' + chalk.yellow('⚠ Merge cancelled by admin'));
    console.log(chalk.gray('No changes have been applied to the main branch.\n'));
  }

  /**
   * Display success message
   */
  displaySuccess(branch) {
    console.log('\n' + chalk.green('✓ Merge completed successfully!'));
    console.log(chalk.gray(`Branch ${branch} has been merged into main.\n`));
  }

  /**
   * Display Tier 3 refusal message
   */
  displayTier3Refusal() {
    console.log('\n' + chalk.bold(chalk.yellow('⚠  Merge not possible — branch divergence is too high for automated resolution')));
    console.log(chalk.white('Peacemaker has analysed the branch and is generating a detailed report to guide manual resolution.'));
    console.log(chalk.gray('Review the report, follow the recommended steps, and try again once the branch is closer to base.\n'));
  }
}

module.exports = ApprovalWorkflow;

// Made with Bob