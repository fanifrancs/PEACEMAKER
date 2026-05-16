/**
 * Resolve Command
 * Get AI-powered suggestions for resolving merge conflicts
 * Implements interactive approval flow (Point 10)
 */

const inquirer = require('inquirer');
const GitOperations = require('../git/operations');
const ConflictAnalyzer = require('../git/analyzer');
const TierClassifier = require('../core/classifier');
const GuidanceOrchestrator = require('../ai/guidance-orchestrator');
const GuidanceReporter = require('../core/guidance-reporter');
const PreValidator = require('../validation/pre-validator');
const ValidationReporter = require('../validation/validation-reporter');
const PatchGenerator = require('../patch/patch-generator');
const Spinner = require('../utils/spinner');
const logger = require('../utils/logger');
const config = require('../utils/config');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');

async function resolveCommand(branch, options) {
  const spinner = new Spinner();

  try {
    // Validate configuration
    if (!config.isConfigured()) {
      logger.error('IBM Bob API key not configured');
      console.log(chalk.yellow('\n⚠️  Configuration Required'));
      console.log(chalk.gray('Please set IBM_BOB_API_KEY in your .env file'));
      console.log(chalk.gray('Copy .env.example to .env and add your API key\n'));
      process.exit(1);
    }

    // Initialize components
    const gitOps = new GitOperations();
    const analyzer = new ConflictAnalyzer(gitOps);
    const classifier = new TierClassifier();
    const orchestrator = new GuidanceOrchestrator(gitOps);
    const reporter = new GuidanceReporter();

    // Validate git repository
    spinner.start('Checking git repository...');
    const isRepo = await gitOps.isGitRepository();
    if (!isRepo) {
      spinner.fail('Not a git repository');
      process.exit(1);
    }
    spinner.succeed('Git repository validated');

    // Determine branches
    const sourceBranch = branch || await gitOps.getCurrentBranch();
    const requestedTarget = options.target || 'main';
    
    // Auto-detect upstream branch if available
    const targetBranch = await gitOps.getUpstreamBranch(requestedTarget);

    logger.info(`Resolving merge: ${sourceBranch} → ${targetBranch}`);
    if (targetBranch !== requestedTarget) {
      logger.info(`Using upstream branch: ${targetBranch}`);
    }

    // Run analysis (same as analyze command)
    spinner.start('Analyzing merge...');
    
    const forkPoint = await gitOps.detectForkPoint(sourceBranch, targetBranch);
    const divergence = await gitOps.calculateDivergence(sourceBranch, targetBranch);
    const changedFiles = await gitOps.getChangedFiles(sourceBranch, targetBranch);
    const mergeResult = await gitOps.simulateMerge(sourceBranch, targetBranch);
    const conflictAnalysis = await analyzer.analyzeConflicts(mergeResult, sourceBranch, targetBranch);
    const classification = classifier.classify(divergence, changedFiles, conflictAnalysis);

    const analysis = {
      sourceBranch,
      targetBranch,
      forkPoint,
      divergence,
      changedFiles,
      mergeResult,
      conflictAnalysis,
      classification,
    };

    spinner.succeed('Analysis complete');

    // Check if AI assistance is needed
    if (classification.tier === 1) {
      spinner.info('Tier 1 merge - AI assistance not needed');
      console.log(chalk.green('\n✓ This is a simple merge that can be done directly'));
      console.log(chalk.gray('Run: git merge ' + targetBranch));
      return;
    }

    if (classification.tier === 3) {
      spinner.warn('Tier 3 merge - Manual intervention recommended');
      console.log(chalk.red('\n⚠️  This merge is too complex for automatic resolution'));
      console.log(chalk.gray('Consider rebasing or manual conflict resolution'));
      return;
    }

    // Generate AI guidance
    spinner.start('Generating AI-powered guidance...');
    const guidance = await orchestrator.generateGuidance(analysis, {
      validateSyntax: !options.skipValidation,
      validationLevel: options.validationLevel || 'basic',
    });
    spinner.succeed('AI guidance generated');

    // Run pre-validation (Point 9)
    let validationResults = null;
    if (!options.skipValidation) {
      spinner.start('Running pre-validation checks...');
      const preValidator = new PreValidator(gitOps);
      const validationReporter = new ValidationReporter();
      
      try {
        // Extract array of files from changedFiles object
        const filesToValidate = Array.from(new Set([
          ...changedFiles.sourceFiles,
          ...changedFiles.targetFiles,
        ]));
        
        validationResults = await preValidator.validate(filesToValidate, {
          validationLevel: options.validationLevel || 'basic',
          skipValidation: options.skipValidation,
        });
        spinner.succeed(`Pre-validation complete (${validationResults.duration}ms)`);
        
        // Display validation results
        validationReporter.displayResults(validationResults);
      } catch (error) {
        spinner.warn('Pre-validation encountered issues');
        logger.error('Validation error:', error.message);
      }
    }

    // Display guidance report
    if (options.output === 'json') {
      const fullReport = {
        guidance,
        validation: validationResults,
      };
      console.log(JSON.stringify(fullReport, null, 2));
      return;
    }

    reporter.displayGuidanceReport(guidance);

    // Interactive approval flow (unless auto-apply)
    if (options.autoApply) {
      // Auto-apply high-confidence suggestions
      await autoApplySuggestions(guidance, spinner);
      return;
    }

    // Interactive approval
    await interactiveApproval(guidance, analysis, spinner);

  } catch (error) {
    spinner.fail('Resolution failed');
    logger.error('Error during resolution:', error.message);
    
    if (process.env.PEACEMAKER_LOG_LEVEL === 'debug') {
      console.error(error);
    }
    
    process.exit(1);
  }
}

/**
 * Interactive approval flow
 */
async function interactiveApproval(guidance, analysis, spinner) {
  console.log('\n');
  logger.header('🔍 Interactive Review');

  // Ask if user wants to proceed
  const { proceed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'proceed',
    message: 'Would you like to review and apply AI suggestions?',
    default: true,
  }]);

  if (!proceed) {
    console.log(chalk.gray('\nOperation cancelled'));
    return;
  }

  const approved = [];
  const skipped = [];

  // Review conflicts
  if (guidance.components.conflicts && guidance.components.conflicts.resolutions) {
    const conflictApprovals = await reviewConflicts(guidance.components.conflicts);
    approved.push(...conflictApprovals.approved);
    skipped.push(...conflictApprovals.skipped);
  }

  // Review imports
  if (guidance.components.imports && guidance.components.imports.issues) {
    const importApprovals = await reviewImports(guidance.components.imports);
    approved.push(...importApprovals.approved);
    skipped.push(...importApprovals.skipped);
  }

  // Review dependencies
  if (guidance.components.dependencies && guidance.components.dependencies.issues) {
    const depApprovals = await reviewDependencies(guidance.components.dependencies);
    approved.push(...depApprovals.approved);
    skipped.push(...depApprovals.skipped);
  }

  // Summary
  console.log('\n');
  logger.header('📋 Review Summary');
  console.log(`   ${chalk.green('Approved:')} ${approved.length}`);
  console.log(`   ${chalk.yellow('Skipped:')} ${skipped.length}`);

  if (approved.length === 0) {
    console.log(chalk.gray('\nNo suggestions approved'));
    return;
  }

  // Ask for final confirmation
  const { applyChanges } = await inquirer.prompt([{
    type: 'confirm',
    name: 'applyChanges',
    message: `Apply ${approved.length} approved suggestions?`,
    default: true,
  }]);

  if (applyChanges) {
    // Generate patches from approved suggestions
    spinner.start('Generating patches...');
    const gitOps = new GitOperations();
    const patchGenerator = new PatchGenerator(gitOps);
    
    try {
      const patches = await patchGenerator.generatePatches(approved);
      
      // Save patches to file
      const patchDir = '.peacemaker';
      await fs.mkdir(patchDir, { recursive: true });
      
      const patchFile = path.join(patchDir, 'patches.json');
      await fs.writeFile(patchFile, JSON.stringify(patches, null, 2), 'utf8');
      
      // Also save human-readable format
      const readableFile = path.join(patchDir, 'patches.md');
      const readableContent = patchGenerator.formatPatchesForFile(patches);
      await fs.writeFile(readableFile, readableContent, 'utf8');
      
      spinner.succeed(`Generated ${patches.metadata.generatedPatches} patches`);
      
      // Store guidance for commit message
      patches.guidance = guidance;
      await fs.writeFile(patchFile, JSON.stringify(patches, null, 2), 'utf8');
      
      console.log(chalk.green('\n✓ Patches generated successfully'));
      console.log(chalk.gray(`Patches saved to: ${patchFile}`));
      console.log(chalk.gray(`Readable format: ${readableFile}`));
      console.log(chalk.yellow('\nNext steps:'));
      console.log(chalk.gray('1. Review patches: cat .peacemaker/patches.md'));
      console.log(chalk.gray('2. Apply patches: peacemaker apply'));
      console.log(chalk.gray('3. Or apply with commit: peacemaker apply --commit'));
    } catch (error) {
      spinner.fail('Failed to generate patches');
      logger.error('Patch generation error:', error.message);
      
      if (process.env.PEACEMAKER_LOG_LEVEL === 'debug') {
        console.error(error);
      }
    }
  } else {
    console.log(chalk.gray('\nChanges not applied'));
  }
}

/**
 * Review conflict resolutions
 */
async function reviewConflicts(conflicts) {
  const approved = [];
  const skipped = [];

  if (!conflicts.resolutions || conflicts.resolutions.length === 0) {
    return { approved, skipped };
  }

  console.log('\n');
  logger.section('⚔️  Reviewing Conflict Resolutions');

  for (const resolution of conflicts.resolutions) {
    if (!resolution.success) continue;

    console.log(`\n${chalk.bold(resolution.file)}`);
    console.log(`Type: ${resolution.conflictType}`);
    console.log(`Confidence: ${resolution.resolution.confidence * 100}%`);
    console.log(`Approach: ${resolution.resolution.approach}`);
    console.log(chalk.gray(resolution.resolution.reasoning));

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Action:',
      choices: [
        { name: 'Accept', value: 'accept' },
        { name: 'Skip', value: 'skip' },
        { name: 'View Diff', value: 'diff' },
        { name: 'Cancel All', value: 'cancel' },
      ],
    }]);

    if (action === 'cancel') {
      throw new Error('User cancelled operation');
    }

    if (action === 'accept') {
      approved.push(resolution);
    } else if (action === 'skip') {
      skipped.push(resolution);
    } else if (action === 'diff') {
      // Show diff (simplified for now)
      console.log(chalk.gray('\n--- Suggested Resolution ---'));
      console.log(resolution.resolution.suggestedCode?.substring(0, 500) || 'N/A');
      console.log(chalk.gray('--- End ---\n'));
      
      // Ask again
      const { retry } = await inquirer.prompt([{
        type: 'list',
        name: 'retry',
        message: 'Action:',
        choices: ['Accept', 'Skip'],
      }]);
      
      if (retry === 'Accept') {
        approved.push(resolution);
      } else {
        skipped.push(resolution);
      }
    }
  }

  return { approved, skipped };
}

/**
 * Review import fixes
 */
async function reviewImports(imports) {
  const approved = [];
  const skipped = [];

  if (!imports.issues || imports.issues.length === 0) {
    return { approved, skipped };
  }

  console.log('\n');
  logger.section('📦 Reviewing Import Fixes');

  for (const fileIssue of imports.issues.slice(0, 10)) {
    console.log(`\n${chalk.bold(fileIssue.file)}`);
    
    for (const issue of fileIssue.issues) {
      if (issue.type === 'moved-file') {
        console.log(`\n${chalk.green('✓')} File moved detected`);
        console.log(`Old: ${issue.oldPath}`);
        console.log(`New: ${issue.newPath}`);
        console.log(`Confidence: ${issue.confidence * 100}%`);

        const { accept } = await inquirer.prompt([{
          type: 'confirm',
          name: 'accept',
          message: 'Apply this fix?',
          default: true,
        }]);

        if (accept) {
          approved.push(issue);
        } else {
          skipped.push(issue);
        }
      }
    }
  }

  return { approved, skipped };
}

/**
 * Review dependency conflicts
 */
async function reviewDependencies(dependencies) {
  const approved = [];
  const skipped = [];

  const versionConflicts = dependencies.issues?.filter((i) => i.type === 'version-conflict') || [];
  
  if (versionConflicts.length === 0) {
    return { approved, skipped };
  }

  console.log('\n');
  logger.section('📚 Reviewing Dependency Conflicts');

  for (const conflict of versionConflicts.slice(0, 5)) {
    console.log(`\n${chalk.bold(conflict.package)}`);
    console.log(`Feature: ${conflict.sourceVersion}`);
    console.log(`Target: ${conflict.targetVersion}`);
    console.log(`Suggested: ${chalk.green(conflict.suggestion)}`);
    console.log(`Risk: ${conflict.riskLevel}`);
    console.log(chalk.gray(conflict.reasoning));

    const { accept } = await inquirer.prompt([{
      type: 'confirm',
      name: 'accept',
      message: 'Use suggested version?',
      default: conflict.confidence > 0.7,
    }]);

    if (accept) {
      approved.push(conflict);
    } else {
      skipped.push(conflict);
    }
  }

  return { approved, skipped };
}

/**
 * Auto-apply high-confidence suggestions
 */
async function autoApplySuggestions(guidance, spinner) {
  spinner.start('Auto-applying high-confidence suggestions...');

  let applied = 0;

  // Auto-apply conflict resolutions with >80% confidence
  if (guidance.components.conflicts?.resolutions) {
    const highConfidence = guidance.components.conflicts.resolutions.filter(
      (r) => r.success && r.resolution.confidence >= 0.8,
    );
    applied += highConfidence.length;
  }

  // Auto-apply import fixes with >90% confidence
  if (guidance.components.imports?.issues) {
    const highConfidence = guidance.components.imports.issues.flatMap((f) =>
      f.issues.filter((i) => i.confidence >= 0.9),
    );
    applied += highConfidence.length;
  }

  spinner.succeed(`Auto-applied ${applied} high-confidence suggestions`);
  
  console.log(chalk.green('\n✓ High-confidence suggestions applied'));
  console.log(chalk.gray('Review remaining suggestions manually if needed'));
}

module.exports = resolveCommand;

// Made with Bob
