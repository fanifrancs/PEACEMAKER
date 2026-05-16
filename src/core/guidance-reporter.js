/**
 * Guidance Reporter
 * Formats and displays AI guidance results
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const logger = require('../utils/logger');

class GuidanceReporter {
  /**
   * Display complete guidance report
   */
  displayGuidanceReport(guidance) {
    console.log('\n');
    this.displayHeader();
    this.displayIntent(guidance.intent);
    this.displaySummary(guidance.summary);
    
    if (guidance.components.conflicts) {
      this.displayConflicts(guidance.components.conflicts);
    }
    
    if (guidance.components.imports) {
      this.displayImports(guidance.components.imports);
    }
    
    if (guidance.components.syntax) {
      this.displaySyntax(guidance.components.syntax);
    }
    
    if (guidance.components.structural) {
      this.displayStructural(guidance.components.structural);
    }
    
    if (guidance.components.dependencies) {
      this.displayDependencies(guidance.components.dependencies);
    }
    
    this.displayRecommendation(guidance.recommendedAction, guidance.overallConfidence);
    console.log('\n');
  }

  /**
   * Display header
   */
  displayHeader() {
    console.log(chalk.bold.cyan('🤖 AI-ASSISTED MERGE GUIDANCE'));
    console.log(chalk.cyan('─'.repeat(60)));
  }

  /**
   * Display developer intent
   */
  displayIntent(intent) {
    if (!intent) return;

    logger.section('📋 Developer Intent');
    
    console.log(`   ${chalk.bold('Intent:')} ${intent.intent}`);
    if (intent.summary) {
      console.log(`   ${chalk.gray(intent.summary)}`);
    }
    
    console.log(`   ${chalk.bold('Confidence:')} ${this.colorizeConfidence(intent.confidence)}`);
    
    if (intent.changeType) {
      console.log(`   ${chalk.bold('Change Type:')} ${intent.changeType}`);
    }
    
    if (intent.scope) {
      console.log(`   ${chalk.bold('Scope:')} ${this.colorizeScope(intent.scope)}`);
    }
  }

  /**
   * Display overall summary
   */
  displaySummary(summary) {
    logger.section('📊 Overall Summary');
    
    console.log(`   ${chalk.bold('Total Issues:')} ${this.colorizeNumber(summary.totalIssues, 5, 15)}`);
    
    if (Object.keys(summary.issuesByComponent).length > 0) {
      console.log(`\n   ${chalk.bold('Issues by Component:')}`);
      Object.entries(summary.issuesByComponent).forEach(([component, count]) => {
        if (count > 0) {
          console.log(`   • ${component}: ${this.colorizeNumber(count, 3, 8)}`);
        }
      });
    }
    
    if (summary.criticalIssues && summary.criticalIssues.length > 0) {
      console.log(`\n   ${chalk.bold.red('Critical Issues:')}`);
      summary.criticalIssues.forEach((issue) => {
        console.log(`   ${chalk.red('⚠')} ${issue}`);
      });
    }
  }

  /**
   * Display conflict resolutions
   */
  displayConflicts(conflicts) {
    if (!conflicts || conflicts.total === 0) return;

    logger.section('⚔️  Conflict Resolutions');
    
    console.log(`   ${chalk.bold('Total Conflicts:')} ${conflicts.total}`);
    console.log(`   ${chalk.green('Resolved:')} ${conflicts.resolved}`);
    console.log(`   ${chalk.red('Failed:')} ${conflicts.failed}`);
    
    if (conflicts.summary?.avgConfidence) {
      console.log(`   ${chalk.bold('Avg Confidence:')} ${conflicts.summary.avgConfidence}%`);
    }

    if (conflicts.resolutions && conflicts.resolutions.length > 0) {
      console.log(`\n   ${chalk.bold('Resolution Details:')}`);
      
      conflicts.resolutions.slice(0, 5).forEach((resolution, index) => {
        if (resolution.success) {
          console.log(`\n   ${chalk.cyan(`${index + 1}.`)} ${chalk.bold(resolution.file)}`);
          console.log(`      Type: ${resolution.conflictType}`);
          console.log(`      Confidence: ${this.colorizeConfidence(resolution.resolution.confidence)}`);
          console.log(`      Approach: ${resolution.resolution.approach}`);
          if (resolution.resolution.reasoning) {
            console.log(`      ${chalk.gray(resolution.resolution.reasoning.substring(0, 80))}...`);
          }
        }
      });
      
      if (conflicts.resolutions.length > 5) {
        console.log(`\n   ${chalk.gray(`... and ${conflicts.resolutions.length - 5} more`)}`);
      }
    }
  }

  /**
   * Display import issues
   */
  displayImports(imports) {
    if (!imports || imports.total === 0) return;

    logger.section('📦 Import Path Issues');
    
    console.log(`   ${chalk.bold('Total Issues:')} ${imports.total}`);
    console.log(`   ${chalk.bold('Files Affected:')} ${imports.filesAffected}`);
    
    if (imports.summary) {
      console.log(`   ${chalk.yellow('Moved Files:')} ${imports.summary.movedFiles}`);
      console.log(`   ${chalk.red('Missing Files:')} ${imports.summary.missingFiles}`);
    }

    if (imports.issues && imports.issues.length > 0) {
      console.log(`\n   ${chalk.bold('Import Fixes:')}`);
      
      imports.issues.slice(0, 3).forEach((fileIssue) => {
        console.log(`\n   ${chalk.bold(fileIssue.file)}`);
        fileIssue.issues.slice(0, 2).forEach((issue) => {
          if (issue.type === 'moved-file') {
            console.log(`      ${chalk.green('✓')} ${issue.oldPath} → ${issue.newPath}`);
            console.log(`         ${chalk.gray(issue.suggestion)}`);
          } else {
            console.log(`      ${chalk.yellow('⚠')} ${issue.oldPath}`);
            console.log(`         ${chalk.gray(issue.suggestion)}`);
          }
        });
      });
    }
  }

  /**
   * Display syntax validation
   */
  displaySyntax(syntax) {
    if (!syntax) return;

    logger.section('✓ Syntax Validation');
    
    if (syntax.invalid === 0) {
      console.log(`   ${chalk.green('✓ All files valid')}`);
      if (syntax.warnings > 0) {
        console.log(`   ${chalk.yellow(`⚠ ${syntax.warnings} warnings`)}`);
      }
      return;
    }

    console.log(`   ${chalk.bold('Total Files:')} ${syntax.total}`);
    console.log(`   ${chalk.green('Valid:')} ${syntax.valid}`);
    console.log(`   ${chalk.red('Invalid:')} ${syntax.invalid}`);
    console.log(`   ${chalk.yellow('Warnings:')} ${syntax.warnings}`);

    if (syntax.results && syntax.results.length > 0) {
      console.log(`\n   ${chalk.bold('Files with Errors:')}`);
      
      syntax.results.filter((r) => !r.valid).slice(0, 3).forEach((result) => {
        console.log(`\n   ${chalk.red('✗')} ${chalk.bold(result.file)}`);
        result.errors.slice(0, 2).forEach((error) => {
          console.log(`      Line ${error.line}: ${error.message}`);
        });
      });
    }
  }

  /**
   * Display structural changes
   */
  displayStructural(structural) {
    if (!structural || structural.total === 0) return;

    logger.section('🏗️  Structural Changes');
    
    console.log(`   ${chalk.bold('Total Changes:')} ${structural.total}`);
    
    if (structural.summary?.needsUpdate) {
      console.log(`   ${chalk.yellow('Needs Update:')} ${structural.summary.needsUpdate}`);
    }

    if (structural.changes && structural.changes.length > 0) {
      console.log(`\n   ${chalk.bold('Change Details:')}`);
      
      structural.changes.slice(0, 3).forEach((change) => {
        console.log(`\n   ${chalk.cyan('•')} ${chalk.bold(change.type)}`);
        if (change.function) {
          console.log(`      Function: ${change.function}`);
          console.log(`      Old: ${chalk.gray(change.oldSignature)}`);
          console.log(`      New: ${chalk.green(change.newSignature)}`);
          if (change.callSites) {
            console.log(`      Call Sites: ${change.callSites.length}`);
          }
        }
      });
    }
  }

  /**
   * Display dependency issues
   */
  displayDependencies(dependencies) {
    if (!dependencies || dependencies.total === 0) return;

    logger.section('📚 Dependency Conflicts');
    
    console.log(`   ${chalk.bold('Total Issues:')} ${dependencies.total}`);
    
    if (dependencies.summary) {
      const { byRisk, versionConflicts } = dependencies.summary;
      
      if (versionConflicts > 0) {
        console.log(`   ${chalk.yellow('Version Conflicts:')} ${versionConflicts}`);
      }
      
      if (byRisk) {
        console.log(`\n   ${chalk.bold('Risk Breakdown:')}`);
        if (byRisk.high) console.log(`   ${chalk.red('High:')} ${byRisk.high}`);
        if (byRisk.medium) console.log(`   ${chalk.yellow('Medium:')} ${byRisk.medium}`);
        if (byRisk.low) console.log(`   ${chalk.green('Low:')} ${byRisk.low}`);
      }
    }

    if (dependencies.issues && dependencies.issues.length > 0) {
      console.log(`\n   ${chalk.bold('Conflict Details:')}`);
      
      dependencies.issues.filter((i) => i.type === 'version-conflict').slice(0, 3).forEach((issue) => {
        console.log(`\n   ${chalk.bold(issue.package)}`);
        console.log(`      Feature: ${issue.sourceVersion}`);
        console.log(`      Target: ${issue.targetVersion}`);
        console.log(`      Suggested: ${chalk.green(issue.suggestion)}`);
        console.log(`      ${chalk.gray(issue.reasoning)}`);
      });
    }
  }

  /**
   * Display recommendation
   */
  displayRecommendation(recommendation, confidence) {
    logger.section('💡 Recommendation');
    
    const actionColors = {
      'apply-with-review': chalk.green,
      'careful-review': chalk.yellow,
      'manual-intervention': chalk.red,
      'fix-syntax-errors': chalk.red,
      'review-and-apply': chalk.yellow,
    };

    const actionColor = actionColors[recommendation.action] || chalk.white;

    console.log(`   ${chalk.bold('Action:')} ${actionColor.bold(recommendation.action.toUpperCase())}`);
    console.log(`   ${chalk.bold('Priority:')} ${this.colorizePriority(recommendation.priority)}`);
    console.log(`   ${chalk.bold('Overall Confidence:')} ${confidence}%`);
    console.log(`\n   ${recommendation.description}`);
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(guidance) {
    return JSON.stringify({
      timestamp: guidance.timestamp,
      intent: guidance.intent,
      summary: guidance.summary,
      overallConfidence: guidance.overallConfidence,
      recommendedAction: guidance.recommendedAction,
      components: {
        conflicts: this.summarizeComponent(guidance.components.conflicts),
        imports: this.summarizeComponent(guidance.components.imports),
        syntax: this.summarizeComponent(guidance.components.syntax),
        structural: this.summarizeComponent(guidance.components.structural),
        dependencies: this.summarizeComponent(guidance.components.dependencies),
      },
    }, null, 2);
  }

  /**
   * Summarize component for JSON
   */
  summarizeComponent(component) {
    if (!component) return null;
    
    return {
      total: component.total || 0,
      summary: component.summary || null,
      hasIssues: (component.total || 0) > 0,
    };
  }

  // Helper methods for colorization

  colorizeConfidence(confidence) {
    const value = typeof confidence === 'number' ? confidence : parseFloat(confidence);
    const percentage = value <= 1 ? Math.round(value * 100) : value;
    
    if (percentage >= 80) return chalk.green(`${percentage}%`);
    if (percentage >= 60) return chalk.yellow(`${percentage}%`);
    return chalk.red(`${percentage}%`);
  }

  colorizeScope(scope) {
    const colors = {
      small: chalk.green,
      medium: chalk.yellow,
      large: chalk.red,
    };
    return (colors[scope] || chalk.white)(scope);
  }

  colorizeNumber(value, warningThreshold, dangerThreshold) {
    if (value <= warningThreshold) return chalk.green(value);
    if (value <= dangerThreshold) return chalk.yellow(value);
    return chalk.red(value);
  }

  colorizePriority(priority) {
    const colors = {
      low: chalk.green,
      medium: chalk.yellow,
      high: chalk.red,
      critical: chalk.red.bold,
    };
    return (colors[priority] || chalk.white)(priority.toUpperCase());
  }
}

module.exports = GuidanceReporter;

// Made with Bob
