/**
 * Logger Utility
 * Provides colored console output with different log levels
 */

const chalk = require('chalk');

class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  setLevel(level) {
    this.level = level;
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  error(message, ...args) {
    if (this.shouldLog('error')) {
      console.error(chalk.red('✗'), chalk.red(message), ...args);
    }
  }

  warn(message, ...args) {
    if (this.shouldLog('warn')) {
      console.warn(chalk.yellow('⚠'), chalk.yellow(message), ...args);
    }
  }

  info(message, ...args) {
    if (this.shouldLog('info')) {
      console.log(chalk.blue('ℹ'), message, ...args);
    }
  }

  success(message, ...args) {
    if (this.shouldLog('info')) {
      console.log(chalk.green('✓'), chalk.green(message), ...args);
    }
  }

  debug(message, ...args) {
    if (this.shouldLog('debug')) {
      console.log(chalk.gray('⚙'), chalk.gray(message), ...args);
    }
  }

  header(message) {
    if (this.shouldLog('info')) {
      console.log('\n' + chalk.bold.cyan(message));
      console.log(chalk.cyan('─'.repeat(message.length)));
    }
  }

  section(message) {
    if (this.shouldLog('info')) {
      console.log('\n' + chalk.bold(message));
    }
  }

  blank() {
    console.log();
  }
}

// Export singleton instance
module.exports = new Logger(process.env.PEACEMAKER_LOG_LEVEL || 'info');

// Made with Bob
