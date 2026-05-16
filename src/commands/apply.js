/**
 * Apply Command
 * Apply approved AI suggestions to files (Point 11)
 */

const inquirer = require('inquirer');
const GitOperations = require('../git/operations');
const PatchGenerator = require('../patch/patch-generator');
const PatchApplicator = require('../patch/patch-applicator');
const Spinner = require('../utils/spinner');
const logger = require('../utils/logger');
const chalk = require('chalk');
const fs = require('fs').promises;

async function applyCommand(patchFile, options) {
  const spinner = new Spinner();

  try {
    // Initialize components
    const gitOps = new GitOperations();
    const patchGenerator = new PatchGenerator(gitOps);
    const patchApplicator = new PatchApplicator(gitOps);

    // Validate git repository
    spinner.start('Checking git repository...');
    const isRepo = await gitOps.isGitRepository();
    if (!isRepo) {
      spinner.fail('Not a git repository');
      process.exit(1);
    }
    spinner.succeed('Git repository validated');

    // Load patches
    spinner.start('Loading patches...');
    let patches;
    
    if (patchFile) {
      // Load from file
      const content = await fs.readFile(patchFile, 'utf8');
      patches = JSON.parse(content);
    } else {
      // Load from default location
      const defaultPath = '.peacemaker/patches.json';
      try {
        const content = await fs.readFile(defaultPath, 'utf8');
        patches = JSON.parse(content);
      } catch (error) {
        spinner.fail('No patches found');
        console.log(chalk.yellow('\n⚠️  No patches file found'));
        console.log(chalk.gray('Run `peacemaker resolve` first to generate patches\n'));
        process.exit(1);
      }
    }
    
    spinner.succeed(`Loaded ${patches.metadata?.generatedPatches || 0} patches`);

    // Display patch summary
    displayPatchSummary(patches);

    // Confirm application
    if (!options.yes && !options.dryRun) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Apply these patches?',
        default: false,
      }]);

      if (!confirm) {
        console.log(chalk.gray('\nOperation cancelled'));
        return;
      }
    }

    // Apply patches
    spinner.start('Applying patches...');
    const results = await patchApplicator.applyPatches(patches, {
      dryRun: options.dryRun,
    });
    spinner.succeed('Patches applied');

    // Display results
    displayResults(results);

    // Create commit if requested
    if (options.commit && !options.dryRun && results.metadata.successCount > 0) {
      spinner.start('Creating commit...');
      
      const commitResult = await patchApplicator.createCommit(results, patches.guidance, {
        dryRun: options.dryRun,
      });

      if (commitResult.success) {
        spinner.succeed('Commit created');
        console.log(chalk.green('\n✓ Changes committed successfully'));
        console.log(chalk.gray(`Files committed: ${commitResult.filesCommitted}`));
      } else {
        spinner.fail('Failed to create commit');
        console.log(chalk.red(`\nError: ${commitResult.error}`));
      }
    }

    // Summary
    console.log('\n');
    logger.header('📊 Summary');
    console.log(`   ${chalk.green('Applied:')} ${results.metadata.successCount}`);
    console.log(`   ${chalk.red('Failed:')} ${results.metadata.failureCount}`);
    console.log(`   ${chalk.yellow('Skipped:')} ${results.skipped.length}`);

    if (options.dryRun) {
      console.log(chalk.yellow('\n⚠️  Dry run mode - no changes were made'));
    }

    console.log('');

  } catch (error) {
    spinner.fail('Application failed');
    logger.error('Error during application:', error.message);
    
    if (process.env.PEACEMAKER_LOG_LEVEL === 'debug') {
      console.error(error);
    }
    
    process.exit(1);
  }
}

/**
 * Display patch summary
 */
function displayPatchSummary(patches) {
  console.log('\n');
  logger.header('📋 Patch Summary');

  const conflictCount = patches.conflicts?.length || 0;
  const importCount = patches.imports?.length || 0;
  const depCount = patches.dependencies?.length || 0;

  console.log(`   ${chalk.blue('Conflict Resolutions:')} ${conflictCount}`);
  console.log(`   ${chalk.blue('Import Fixes:')} ${importCount}`);
  console.log(`   ${chalk.blue('Dependency Updates:')} ${depCount}`);
  console.log(`   ${chalk.blue('Total Patches:')} ${patches.metadata?.generatedPatches || 0}`);

  // Show high-confidence patches
  const allPatches = [
    ...(patches.conflicts || []),
    ...(patches.imports || []),
    ...(patches.dependencies || []),
  ];

  const highConfidence = allPatches.filter(p => p.confidence >= 0.8);
  if (highConfidence.length > 0) {
    console.log(`   ${chalk.green('High Confidence (≥80%):')} ${highConfidence.length}`);
  }

  console.log('');
}

/**
 * Display application results
 */
function displayResults(results) {
  console.log('\n');
  logger.header('✅ Application Results');

  // Applied patches
  if (results.applied.length > 0) {
    console.log(chalk.green(`\n✓ Successfully applied ${results.applied.length} patch(es):\n`));
    
    results.applied.forEach((result, index) => {
      console.log(chalk.green(`${index + 1}. ${result.file}`));
      console.log(chalk.gray(`   Type: ${result.type}`));
      console.log(chalk.gray(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`));
      
      if (result.type === 'conflict-resolution') {
        console.log(chalk.gray(`   Approach: ${result.approach}`));
        console.log(chalk.gray(`   Lines changed: ${result.linesChanged}`));
      } else if (result.type === 'import-fix') {
        console.log(chalk.gray(`   ${result.oldPath} → ${result.newPath}`));
      } else if (result.type === 'dependency-update') {
        console.log(chalk.gray(`   ${result.package}: ${result.oldVersion} → ${result.newVersion}`));
      }
      
      console.log('');
    });
  }

  // Failed patches
  if (results.failed.length > 0) {
    console.log(chalk.red(`\n✗ Failed to apply ${results.failed.length} patch(es):\n`));
    
    results.failed.forEach((result, index) => {
      console.log(chalk.red(`${index + 1}. ${result.file}`));
      console.log(chalk.gray(`   Type: ${result.type}`));
      console.log(chalk.gray(`   Error: ${result.error}`));
      console.log('');
    });
  }

  // Skipped patches
  if (results.skipped.length > 0) {
    console.log(chalk.yellow(`\n⊘ Skipped ${results.skipped.length} patch(es)\n`));
  }
}

module.exports = applyCommand;

// Made with Bob
