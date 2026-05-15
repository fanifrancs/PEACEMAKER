/**
 * Spinner Utility
 * Provides progress indicators for long-running operations
 */

const ora = require('ora');
const chalk = require('chalk');

class Spinner {
  constructor() {
    this.spinner = null;
  }

  start(text) {
    this.spinner = ora({
      text: chalk.cyan(text),
      color: 'cyan',
    }).start();
    return this;
  }

  update(text) {
    if (this.spinner) {
      this.spinner.text = chalk.cyan(text);
    }
    return this;
  }

  succeed(text) {
    if (this.spinner) {
      this.spinner.succeed(chalk.green(text));
      this.spinner = null;
    }
    return this;
  }

  fail(text) {
    if (this.spinner) {
      this.spinner.fail(chalk.red(text));
      this.spinner = null;
    }
    return this;
  }

  warn(text) {
    if (this.spinner) {
      this.spinner.warn(chalk.yellow(text));
      this.spinner = null;
    }
    return this;
  }

  info(text) {
    if (this.spinner) {
      this.spinner.info(chalk.blue(text));
      this.spinner = null;
    }
    return this;
  }

  stop() {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
    return this;
  }
}

module.exports = Spinner;

// Made with Bob
