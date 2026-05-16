#!/usr/bin/env node

/**
 * Postinstall Script
 * Creates default configuration file for Peacemaker
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

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

async function postinstall() {
  try {
    // Check if we're in the Peacemaker repo itself (skip setup)
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    
    if (packageJson.name === 'peacemaker') {
      // We're in the Peacemaker repo itself, skip postinstall
      return;
    }

    // Check if config already exists
    const configPath = path.join(process.cwd(), '.peacemakerrc.json');
    
    let configExists = false;
    
    try {
      await fs.access(configPath);
      configExists = true;
    } catch (e) { /* File doesn't exist */ }

    if (configExists) {
      // Already set up, skip
      return;
    }

    console.log(chalk.cyan('\n⚔️  Setting up Peacemaker configuration...\n'));

    // Write config file
    await fs.writeFile(configPath, CONFIG_TEMPLATE, 'utf8');
    console.log(chalk.green('✓ Created .peacemakerrc.json'));

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
    console.log(chalk.dim('Run "npx peacemaker init" to reconfigure anytime.\n'));

  } catch (error) {
    // Silently fail - don't break npm install
    // Users can run `npx peacemaker init` manually if needed
  }
}

// Only run if this is being executed directly (not required as a module)
if (require.main === module) {
  postinstall();
}

module.exports = postinstall;

// Made with Bob
