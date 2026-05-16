/**
 * Init Command
 * Sets up Peacemaker configuration in a repository
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const Spinner = require('../utils/spinner');
const logger = require('../utils/logger');

const CONFIG_TEMPLATE = `{
  "validationLevel": "basic",
  "autoApply": false,
  "skipValidation": false,
  "targetBranch": "main",
  "excludePatterns": [
    "*.md",
    "*.txt",
    "docs/**",
    "test/**",
    "tests/**"
  ]
}
`;

async function initCommand(options) {
  const spinner = new Spinner();
  const isInteractive = !options.yes;

  try {
    console.log(chalk.bold.cyan('\n⚔️  PEACEMAKER SETUP\n'));
    console.log('This will configure Peacemaker in your repository.\n');

    // Check if already initialized
    const configPath = path.join(process.cwd(), '.peacemakerrc.json');

    let shouldProceed = true;
    if (isInteractive) {
      try {
        await fs.access(configPath);
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Peacemaker configuration file already exists. Overwrite?',
            default: false,
          },
        ]);
        shouldProceed = overwrite;
      } catch (e) { /* File doesn't exist */ }
    }

    if (!shouldProceed) {
      console.log(chalk.yellow('\n✋ Setup cancelled.\n'));
      return;
    }

    // Write config file
    spinner.start('Creating configuration file...');
    await fs.writeFile(configPath, CONFIG_TEMPLATE, 'utf8');
    spinner.succeed('Configuration file created');

    // Success message
    console.log(chalk.bold.green('\n✅ Peacemaker setup complete!\n'));
    console.log(chalk.bold('Usage:\n'));
    console.log('1. Set up your environment variables:');
    console.log(chalk.cyan('   IBM_BOB_API_KEY=your_api_key'));
    console.log(chalk.cyan('   IBM_BOB_API_URL=your_api_url\n'));
    console.log('2. Analyze your branch:');
    console.log(chalk.gray('   npx peacemaker analyze feature-branch --target main\n'));
    console.log('3. Get AI guidance:');
    console.log(chalk.gray('   npx peacemaker resolve feature-branch --target main\n'));
    console.log('4. Apply patches:');
    console.log(chalk.gray('   npx peacemaker apply --commit\n'));
    console.log(chalk.dim('For more information, visit: https://github.com/femix300/PEACEMAKER\n'));

  } catch (error) {
    spinner.fail('Setup failed');
    logger.error('Failed to initialize Peacemaker:', error.message);
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

module.exports = initCommand;

// Made with Bob
