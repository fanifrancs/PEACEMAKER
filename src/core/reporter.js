/**
 * Reporter
 * Formats and displays analysis results
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const logger = require('../utils/logger');

class Reporter {
  /**
   * Generate and display analysis report
   */
  displayAnalysisReport(analysis) {
    console.log('\n');
    this.displayHeader();
    this.displayDivergence(analysis.divergence, analysis.forkPoint);
    this.displayRiskAssessment(analysis.classification);
    this.displayChangedFiles(analysis.changedFiles);
    
    if (analysis.conflictAnalysis.hasConflicts) {
      this.displayConflicts(analysis.conflictAnalysis);
    } else {
      this.displayNoConflicts();
    }
    
    this.displayRecommendation(analysis.classification);
    console.log('\n');
  }

  /**
   * Display header
   */
  displayHeader() {
    console.log(chalk.bold.cyan('⚔️  PEACEMAKER ANALYSIS'));
    console.log(chalk.cyan('─'.repeat(60)));
  }

  /**
   * Display divergence information
   */
  displayDivergence(divergence, forkPoint) {
    logger.section('📊 Divergence Analysis');
    
    const table = new Table({
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 2, 'padding-right': 2 },
    });

    table.push(
      ['Fork Point', chalk.gray(forkPoint.hash.substring(0, 7))],
      ['Fork Date', chalk.gray(forkPoint.date.toLocaleDateString())],
      ['Days Since Fork', this.colorizeNumber(forkPoint.daysSinceFork, 7, 14)],
      ['Commits Ahead', chalk.green(`+${divergence.commitsAhead}`)],
      ['Commits Behind', chalk.yellow(`-${divergence.commitsBehind}`)],
      ['Total Divergence', this.colorizeNumber(divergence.totalDivergence, 10, 20)],
    );

    console.log(table.toString());
  }

  /**
   * Display risk assessment
   */
  displayRiskAssessment(classification) {
    logger.section('🎯 Risk Assessment');
    
    const tierColors = {
      1: chalk.green,
      2: chalk.yellow,
      3: chalk.red,
    };
    
    const tierLabels = {
      1: 'Simple',
      2: 'Moderate',
      3: 'Complex',
    };

    const tierColor = tierColors[classification.tier];
    const tierLabel = tierLabels[classification.tier];

    console.log(`   Tier: ${tierColor.bold(`${classification.tier} (${tierLabel})`)}`);
    console.log(`   Overall Score: ${this.colorizeScore(classification.factors.weightedScore)}`);
    
    // Display factor breakdown
    console.log('\n   Factor Breakdown:');
    const factorTable = new Table({
      head: ['Factor', 'Value', 'Score', 'Impact'],
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
      style: { 'padding-left': 2, 'padding-right': 2 },
    });

    const report = classification;
    factorTable.push(
      [
        'Divergence',
        report.factors.divergence.value,
        this.formatScore(report.factors.divergence.score),
        this.colorizeImpact(this.getImpactLevel(report.factors.divergence.score)),
      ],
      [
        'File Count',
        report.factors.fileCount.value,
        this.formatScore(report.factors.fileCount.score),
        this.colorizeImpact(this.getImpactLevel(report.factors.fileCount.score)),
      ],
      [
        'Overlapping Files',
        report.factors.overlappingFiles.value,
        this.formatScore(report.factors.overlappingFiles.score),
        this.colorizeImpact(this.getImpactLevel(report.factors.overlappingFiles.score)),
      ],
      [
        'Conflicts',
        report.factors.conflicts.value,
        this.formatScore(report.factors.conflicts.score),
        this.colorizeImpact(this.getImpactLevel(report.factors.conflicts.score)),
      ],
    );

    console.log(factorTable.toString());
  }

  /**
   * Display changed files
   */
  displayChangedFiles(changedFiles) {
    logger.section('📁 Changed Files');
    
    console.log(`   Total Files: ${chalk.bold(changedFiles.totalFiles)}`);
    console.log(`   Feature Branch: ${chalk.cyan(changedFiles.sourceFiles.length)} files`);
    console.log(`   Target Branch: ${chalk.blue(changedFiles.targetFiles.length)} files`);
    console.log(`   Overlapping: ${this.colorizeNumber(changedFiles.overlappingFiles.length, 3, 8)} files`);

    if (changedFiles.overlappingFiles.length > 0) {
      console.log('\n   Overlapping Files:');
      changedFiles.overlappingFiles.slice(0, 10).forEach((file) => {
        console.log(`   ${chalk.yellow('•')} ${file}`);
      });
      
      if (changedFiles.overlappingFiles.length > 10) {
        console.log(`   ${chalk.gray(`... and ${changedFiles.overlappingFiles.length - 10} more`)}`);
      }
    }
  }

  /**
   * Display conflicts
   */
  displayConflicts(conflictAnalysis) {
    logger.section('⚠️  Conflicts Detected');
    
    const summary = conflictAnalysis.conflicts.reduce((acc, conflict) => {
      if (conflict.complexity < 0.3) {
        acc.simple += 1;
      } else if (conflict.complexity < 0.7) {
        acc.moderate += 1;
      } else {
        acc.complex += 1;
      }
      return acc;
    }, { simple: 0, moderate: 0, complex: 0 });

    console.log(`   Total Conflicts: ${chalk.red.bold(conflictAnalysis.totalConflicts)}`);
    console.log(`   Simple: ${chalk.green(summary.simple)}`);
    console.log(`   Moderate: ${chalk.yellow(summary.moderate)}`);
    console.log(`   Complex: ${chalk.red(summary.complex)}`);

    console.log('\n   Conflict Files:');
    conflictAnalysis.conflicts.slice(0, 10).forEach((conflict) => {
      const complexityColor = conflict.complexity < 0.3 ? chalk.green
        : conflict.complexity < 0.7 ? chalk.yellow
        : chalk.red;
      
      console.log(`   ${chalk.red('✗')} ${conflict.file} ${complexityColor(`(${(conflict.complexity * 100).toFixed(0)}%)`)}`);
    });

    if (conflictAnalysis.conflicts.length > 10) {
      console.log(`   ${chalk.gray(`... and ${conflictAnalysis.conflicts.length - 10} more`)}`);
    }
  }

  /**
   * Display no conflicts message
   */
  displayNoConflicts() {
    logger.section('✅ No Conflicts');
    console.log(`   ${chalk.green('No merge conflicts detected!')}`);
  }

  /**
   * Display recommendation
   */
  displayRecommendation(classification) {
    logger.section('💡 Recommendation');
    
    const rec = classification.recommendation;
    const actionColors = {
      'auto-merge': chalk.green,
      'ai-assisted-merge': chalk.yellow,
      'manual-merge': chalk.red,
    };

    const actionColor = actionColors[rec.action] || chalk.white;

    console.log(`   Action: ${actionColor.bold(rec.action.toUpperCase())}`);
    console.log(`   Confidence: ${this.colorizeConfidence(rec.confidence)}`);
    console.log(`   ${rec.description}`);

    if (rec.warnings && rec.warnings.length > 0) {
      console.log('\n   Warnings:');
      rec.warnings.forEach((warning) => {
        console.log(`   ${chalk.yellow('⚠')} ${warning}`);
      });
    }

    console.log('\n   Recommended Steps:');
    rec.steps.forEach((step, index) => {
      console.log(`   ${chalk.cyan(`${index + 1}.`)} ${step}`);
    });
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(analysis) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      analysis: {
        divergence: analysis.divergence,
        forkPoint: {
          hash: analysis.forkPoint.hash,
          date: analysis.forkPoint.date,
          daysSinceFork: analysis.forkPoint.daysSinceFork,
        },
        changedFiles: {
          total: analysis.changedFiles.totalFiles,
          source: analysis.changedFiles.sourceFiles.length,
          target: analysis.changedFiles.targetFiles.length,
          overlapping: analysis.changedFiles.overlappingFiles.length,
        },
        conflicts: {
          total: analysis.conflictAnalysis.totalConflicts,
          hasConflicts: analysis.conflictAnalysis.hasConflicts,
        },
        classification: {
          tier: analysis.classification.tier,
          level: analysis.classification.level,
          score: analysis.classification.factors.weightedScore,
          recommendation: analysis.classification.recommendation,
        },
      },
    }, null, 2);
  }

  // Helper methods for colorization

  colorizeNumber(value, warningThreshold, dangerThreshold) {
    if (value <= warningThreshold) {
      return chalk.green(value);
    }
    if (value <= dangerThreshold) {
      return chalk.yellow(value);
    }
    return chalk.red(value);
  }

  colorizeScore(score) {
    const percentage = (score * 100).toFixed(1);
    if (score <= 0.3) {
      return chalk.green(`${percentage}%`);
    }
    if (score <= 0.7) {
      return chalk.yellow(`${percentage}%`);
    }
    return chalk.red(`${percentage}%`);
  }

  formatScore(score) {
    return (score * 100).toFixed(0) + '%';
  }

  getImpactLevel(score) {
    if (score <= 0.3) return 'low';
    if (score <= 0.7) return 'medium';
    return 'high';
  }

  colorizeImpact(impact) {
    const colors = {
      low: chalk.green,
      medium: chalk.yellow,
      high: chalk.red,
    };
    return colors[impact](impact.toUpperCase());
  }

  colorizeConfidence(confidence) {
    const colors = {
      high: chalk.green,
      medium: chalk.yellow,
      low: chalk.red,
    };
    return colors[confidence](confidence.toUpperCase());
  }
}

module.exports = Reporter;

// Made with Bob
