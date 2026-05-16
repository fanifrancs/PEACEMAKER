#!/usr/bin/env node

/**
 * PEACEMAKER CLI Entry Point
 * AI-Assisted Merge Guidance for Git Workflows
 */

const { program } = require('commander');
const chalk = require('chalk');
const packageJson = require('../package.json');

// Import commands
const analyzeCommand = require('../src/commands/analyze');
const resolveCommand = require('../src/commands/resolve');
const applyCommand = require('../src/commands/apply');
const initCommand = require('../src/commands/init');

// Configure CLI
program
  .name('peacemaker')
  .description(chalk.bold('⚔️  PEACEMAKER - AI-Assisted Merge Guidance for Git Workflows'))
  .version(packageJson.version, '-v, --version', 'Output the current version');

// Analyze command
program
  .command('analyze [branch]')
  .description('Analyze a branch for merge conflicts and divergence')
  .option('-t, --target <branch>', 'Target branch to merge into', 'main')
  .option('--ci', 'Run in CI mode (non-interactive)')
  .option('-o, --output <format>', 'Output format (text|json)', 'text')
  .action(analyzeCommand);

// Resolve command
program
  .command('resolve [branch]')
  .description('Get AI-powered suggestions for resolving merge conflicts')
  .option('-t, --target <branch>', 'Target branch to merge into', 'main')
  .option('--auto-apply', 'Automatically apply high-confidence suggestions')
  .option('--skip-validation', 'Skip syntax validation')
  .option('--validation-level <level>', 'Validation level (basic|strict)', 'basic')
  .option('--ci', 'Run in CI mode (non-interactive)')
  .option('-o, --output <format>', 'Output format (text|json)', 'text')
  .action(resolveCommand);

// Apply command
program
  .command('apply [patch-file]')
  .description('Apply generated patches to files')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--dry-run', 'Show what would be applied without making changes')
  .option('--commit', 'Create a git commit after applying patches')
  .action(applyCommand);

// Init command
program
  .command('init')
  .description('Set up Peacemaker configuration in your repository')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--verbose', 'Show detailed error messages')
  .action(initCommand);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

// Made with Bob
