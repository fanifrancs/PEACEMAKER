/**
 * Validation Reporter
 * Formats and displays pre-validation results
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const logger = require('../utils/logger');

class ValidationReporter {
  /**
   * Display validation results
   */
  displayResults(results) {
    console.log('\n');
    logger.header('🔍 Pre-Validation Results');

    // Overall status
    if (results.passed) {
      console.log(chalk.green('✓ All validations passed'));
    } else {
      console.log(chalk.red('✗ Validation failed'));
    }

    console.log(chalk.gray(`Duration: ${results.duration}ms`));
    console.log('');

    // Summary table
    this.displaySummary(results.summary);

    // Detailed results
    if (results.validations.syntax.errors.length > 0 || results.validations.syntax.warnings.length > 0) {
      this.displaySyntaxResults(results.validations.syntax);
    }

    if (results.validations.imports.errors.length > 0 || results.validations.imports.warnings.length > 0) {
      this.displayImportResults(results.validations.imports);
    }

    if (results.validations.types.errors.length > 0 || results.validations.types.warnings.length > 0) {
      this.displayTypeResults(results.validations.types);
    }

    if (results.validations.dependencies.errors.length > 0 || results.validations.dependencies.warnings.length > 0) {
      this.displayDependencyResults(results.validations.dependencies);
    }

    // Final recommendation
    console.log('');
    this.displayRecommendation(results);
  }

  /**
   * Display summary table
   */
  displaySummary(summary) {
    const table = new Table({
      head: ['Metric', 'Value'],
      colWidths: [30, 20],
    });

    table.push(
      ['Total Files', summary.totalFiles],
      ['Files Checked', summary.filesChecked],
      ['Errors Found', this.colorizeCount(summary.errorsFound, 'error')],
      ['Warnings Found', this.colorizeCount(summary.warningsFound, 'warning')]
    );

    console.log(table.toString());
    console.log('');
  }

  /**
   * Display syntax validation results
   */
  displaySyntaxResults(syntax) {
    logger.section('📝 Syntax Validation');

    if (syntax.errors.length > 0) {
      console.log(chalk.red(`\n✗ ${syntax.errors.length} syntax error(s) found:\n`));
      
      syntax.errors.forEach((error, index) => {
        console.log(chalk.red(`${index + 1}. ${error.file}`));
        if (error.errors) {
          error.errors.forEach((err) => {
            console.log(chalk.gray(`   ${err.message || err}`));
          });
        } else {
          console.log(chalk.gray(`   ${error.message || error.type}`));
        }
        console.log('');
      });
    }

    if (syntax.warnings.length > 0) {
      console.log(chalk.yellow(`\n⚠ ${syntax.warnings.length} syntax warning(s):\n`));
      
      syntax.warnings.forEach((warning, index) => {
        console.log(chalk.yellow(`${index + 1}. ${warning.file || warning.type}`));
        if (warning.warnings) {
          warning.warnings.forEach((warn) => {
            console.log(chalk.gray(`   ${warn.message || warn}`));
          });
        } else {
          console.log(chalk.gray(`   ${warning.message}`));
        }
        console.log('');
      });
    }

    if (syntax.errors.length === 0 && syntax.warnings.length === 0) {
      console.log(chalk.green('✓ No syntax issues found'));
    }

    console.log('');
  }

  /**
   * Display import validation results
   */
  displayImportResults(imports) {
    logger.section('📦 Import Resolution');

    if (imports.errors.length > 0) {
      console.log(chalk.red(`\n✗ ${imports.errors.length} import error(s) found:\n`));
      
      imports.errors.forEach((error, index) => {
        console.log(chalk.red(`${index + 1}. ${error.file}:${error.line || '?'}`));
        console.log(chalk.gray(`   Import: ${error.import}`));
        console.log(chalk.gray(`   ${error.message}`));
        console.log('');
      });
    }

    if (imports.warnings.length > 0) {
      console.log(chalk.yellow(`\n⚠ ${imports.warnings.length} import warning(s):\n`));
      
      imports.warnings.forEach((warning, index) => {
        console.log(chalk.yellow(`${index + 1}. ${warning.file || warning.type}`));
        console.log(chalk.gray(`   ${warning.message}`));
        console.log('');
      });
    }

    if (imports.errors.length === 0 && imports.warnings.length === 0) {
      console.log(chalk.green('✓ All imports resolved successfully'));
    }

    console.log('');
  }

  /**
   * Display type validation results
   */
  displayTypeResults(types) {
    logger.section('🔷 Type Validation');

    if (types.errors.length > 0) {
      console.log(chalk.red(`\n✗ ${types.errors.length} type error(s) found:\n`));
      
      types.errors.forEach((error, index) => {
        console.log(chalk.red(`${index + 1}. ${error.file || error.type}`));
        console.log(chalk.gray(`   ${error.message}`));
        console.log('');
      });
    }

    if (types.warnings.length > 0) {
      console.log(chalk.yellow(`\n⚠ ${types.warnings.length} type warning(s):\n`));
      
      types.warnings.forEach((warning, index) => {
        console.log(chalk.yellow(`${index + 1}. ${warning.type}`));
        console.log(chalk.gray(`   ${warning.message}`));
        console.log('');
      });
    }

    if (types.errors.length === 0 && types.warnings.length === 0) {
      console.log(chalk.green('✓ No type issues found'));
    }

    console.log('');
  }

  /**
   * Display dependency validation results
   */
  displayDependencyResults(dependencies) {
    logger.section('📚 Dependency Validation');

    if (dependencies.errors.length > 0) {
      console.log(chalk.red(`\n✗ ${dependencies.errors.length} dependency error(s) found:\n`));
      
      dependencies.errors.forEach((error, index) => {
        console.log(chalk.red(`${index + 1}. ${error.file || error.type}`));
        console.log(chalk.gray(`   ${error.message}`));
        console.log('');
      });
    }

    if (dependencies.warnings.length > 0) {
      console.log(chalk.yellow(`\n⚠ ${dependencies.warnings.length} dependency warning(s):\n`));
      
      dependencies.warnings.forEach((warning, index) => {
        console.log(chalk.yellow(`${index + 1}. ${warning.package || warning.type}`));
        console.log(chalk.gray(`   ${warning.message}`));
        console.log('');
      });
    }

    if (dependencies.errors.length === 0 && dependencies.warnings.length === 0) {
      console.log(chalk.green('✓ All dependencies validated'));
    }

    console.log('');
  }

  /**
   * Display final recommendation
   */
  displayRecommendation(results) {
    logger.section('💡 Recommendation');

    if (results.passed) {
      console.log(chalk.green('✓ Pre-validation passed'));
      console.log(chalk.gray('The code is ready for merge'));
    } else {
      console.log(chalk.red('✗ Pre-validation failed'));
      console.log(chalk.gray('Fix the errors above before proceeding'));
      
      if (results.summary.errorsFound > 0) {
        console.log(chalk.yellow(`\n${results.summary.errorsFound} error(s) must be fixed`));
      }
      
      if (results.summary.warningsFound > 0) {
        console.log(chalk.yellow(`${results.summary.warningsFound} warning(s) should be reviewed`));
      }
    }

    console.log('');
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(results) {
    return JSON.stringify(results, null, 2);
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(results) {
    let md = '# Pre-Validation Report\n\n';

    // Status
    md += `**Status**: ${results.passed ? '✅ Passed' : '❌ Failed'}\n`;
    md += `**Duration**: ${results.duration}ms\n\n`;

    // Summary
    md += '## Summary\n\n';
    md += `- Total Files: ${results.summary.totalFiles}\n`;
    md += `- Files Checked: ${results.summary.filesChecked}\n`;
    md += `- Errors Found: ${results.summary.errorsFound}\n`;
    md += `- Warnings Found: ${results.summary.warningsFound}\n\n`;

    // Syntax
    if (results.validations.syntax.errors.length > 0) {
      md += '## Syntax Errors\n\n';
      results.validations.syntax.errors.forEach((error, index) => {
        md += `${index + 1}. **${error.file}**\n`;
        if (error.errors) {
          error.errors.forEach((err) => {
            md += `   - ${err.message || err}\n`;
          });
        }
        md += '\n';
      });
    }

    // Imports
    if (results.validations.imports.errors.length > 0) {
      md += '## Import Errors\n\n';
      results.validations.imports.errors.forEach((error, index) => {
        md += `${index + 1}. **${error.file}:${error.line}**\n`;
        md += `   - Import: \`${error.import}\`\n`;
        md += `   - ${error.message}\n\n`;
      });
    }

    // Recommendation
    md += '## Recommendation\n\n';
    if (results.passed) {
      md += '✅ Pre-validation passed. The code is ready for merge.\n';
    } else {
      md += '❌ Pre-validation failed. Fix the errors above before proceeding.\n';
    }

    return md;
  }

  /**
   * Colorize count based on value
   */
  colorizeCount(count, type) {
    if (count === 0) {
      return chalk.green(count);
    }
    
    if (type === 'error') {
      return chalk.red(count);
    }
    
    return chalk.yellow(count);
  }
}

module.exports = ValidationReporter;

// Made with Bob
