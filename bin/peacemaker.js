#!/usr/bin/env node
import { Command } from 'commander';
import { runMerge, runAnalyze, runStats, runHistory } from '../src/index.js';

const program = new Command();

program
  .name('peacemaker')
  .description('AI-powered semantic merge resolution using IBM Bob Shell')
  .version('1.0.0');

program
  .command('merge <branch>')
  .description('Merge a feature branch using semantic intent resolution')
  .option('-b, --base <branch>', 'Base branch to merge into (default: current branch)')
  .option('--skip-prompt', 'Skip developer intent prompt (Bob infers from commits)')
  .option('-d, --debug', 'Print extra debugging information')
  .action(runMerge);

program
  .command('analyze <branch>')
  .description('Analyze a branch and generate an AI report without merging')
  .option('-b, --base <branch>', 'Base branch to compare against (default: current branch)')
  .action(runAnalyze);

program
  .command('stats')
  .description('Show Peacemaker merge statistics')
  .action(runStats);

program
  .command('history')
  .description('Show recent merge history from the changelog')
  .option('-n, --count <number>', 'Number of entries to show', '5')
  .action(runHistory);

program.parse();

// Made with Bob
