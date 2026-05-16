/**
 * Analyze Command
 * Analyzes a branch for merge conflicts and divergence
 */

const GitOperations = require('../git/operations');
const ConflictAnalyzer = require('../git/analyzer');
const TierClassifier = require('../core/classifier');
const Reporter = require('../core/reporter');
const Spinner = require('../utils/spinner');
const logger = require('../utils/logger');

async function analyzeCommand(branch, options) {
  const spinner = new Spinner();

  try {
    // Initialize components
    const gitOps = new GitOperations();
    const analyzer = new ConflictAnalyzer(gitOps);
    const classifier = new TierClassifier();
    const reporter = new Reporter();

    // Validate git repository
    spinner.start('Checking git repository...');
    const isRepo = await gitOps.isGitRepository();
    if (!isRepo) {
      spinner.fail('Not a git repository');
      logger.error('Current directory is not a git repository');
      process.exit(1);
    }
    spinner.succeed('Git repository validated');

    // Determine branches
    const sourceBranch = branch || await gitOps.getCurrentBranch();
    const requestedTarget = options.target || 'main';
    
    // Auto-detect upstream branch if available
    const targetBranch = await gitOps.getUpstreamBranch(requestedTarget);

    logger.info(`Analyzing merge: ${sourceBranch} → ${targetBranch}`);
    if (targetBranch !== requestedTarget) {
      logger.info(`Using upstream branch: ${targetBranch}`);
    }

    // Check if branches exist
    spinner.start('Validating branches...');
    const sourceExists = await gitOps.branchExists(sourceBranch);
    const targetExists = await gitOps.branchExists(targetBranch);

    if (!sourceExists) {
      spinner.fail(`Source branch '${sourceBranch}' not found`);
      process.exit(1);
    }
    if (!targetExists) {
      spinner.fail(`Target branch '${targetBranch}' not found`);
      process.exit(1);
    }
    spinner.succeed('Branches validated');

    // Step 6: Detect fork point
    spinner.start('Detecting fork point...');
    const forkPoint = await gitOps.detectForkPoint(sourceBranch, targetBranch);
    spinner.succeed(`Fork point detected: ${forkPoint.hash.substring(0, 7)} (${forkPoint.daysSinceFork} days ago)`);

    // Calculate divergence
    spinner.start('Calculating divergence...');
    const divergence = await gitOps.calculateDivergence(sourceBranch, targetBranch);
    spinner.succeed(`Divergence: +${divergence.commitsAhead} -${divergence.commitsBehind}`);

    // Get changed files
    spinner.start('Analyzing changed files...');
    const changedFiles = await gitOps.getChangedFiles(sourceBranch, targetBranch);
    spinner.succeed(`Changed files: ${changedFiles.totalFiles} (${changedFiles.overlappingFiles.length} overlapping)`);

    // Step 7: Simulate merge
    spinner.start('Simulating merge...');
    const mergeResult = await gitOps.simulateMerge(sourceBranch, targetBranch);
    
    if (mergeResult.success) {
      spinner.succeed('Merge simulation successful - no conflicts');
    } else {
      spinner.warn(`Merge simulation detected ${mergeResult.conflicts.length} conflicts`);
    }

    // Analyze conflicts
    spinner.start('Analyzing conflicts...');
    const conflictAnalysis = await analyzer.analyzeConflicts(
      mergeResult,
      sourceBranch,
      targetBranch,
    );
    
    if (conflictAnalysis.hasConflicts) {
      spinner.succeed(`Conflict analysis complete: ${conflictAnalysis.totalConflicts} conflicts found`);
    } else {
      spinner.succeed('No conflicts detected');
    }

    // Classify merge tier
    spinner.start('Classifying merge complexity...');
    const classification = classifier.classify(divergence, changedFiles, conflictAnalysis);
    spinner.succeed(`Classification: Tier ${classification.tier} (${classification.level})`);

    // Prepare analysis result
    const analysis = {
      sourceBranch,
      targetBranch,
      forkPoint,
      divergence,
      changedFiles,
      mergeResult,
      conflictAnalysis,
      classification,
      timestamp: new Date().toISOString(),
    };

    // Output results
    if (options.output === 'json') {
      console.log(reporter.generateJSONReport(analysis));
    } else {
      reporter.displayAnalysisReport(analysis);
    }

  } catch (error) {
    spinner.fail('Analysis failed');
    logger.error('Error during analysis:', error.message);
    
    if (process.env.PEACEMAKER_LOG_LEVEL === 'debug') {
      console.error(error);
    }
    
    process.exit(1);
  }
}

module.exports = analyzeCommand;

// Made with Bob
