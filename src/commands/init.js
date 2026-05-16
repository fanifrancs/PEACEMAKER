/**
 * Init Command
 * Sets up Peacemaker CI/CD integration in a repository
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const Spinner = require('../utils/spinner');
const logger = require('../utils/logger');

const WORKFLOW_TEMPLATE = `name: Peacemaker Analysis

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - main
      - develop

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  analyze:
    name: Analyze PR with Peacemaker
    runs-on: ubuntu-latest
    environment: peacemaker
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Fetch all history for proper divergence analysis
          
      - name: Fetch target branch
        run: |
          git fetch origin \${{ github.base_ref }}:\${{ github.base_ref }}
          
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
      
      - name: Validate Secrets
        run: |
          if [ -z "\${{ secrets.IBM_BOB_API_KEY }}" ]; then
            echo "❌ Error: IBM_BOB_API_KEY is not set"
            echo "Please add IBM_BOB_API_KEY to the 'peacemaker' environment secrets"
            exit 1
          fi
          if [ -z "\${{ secrets.IBM_BOB_API_URL }}" ]; then
            echo "❌ Error: IBM_BOB_API_URL is not set"
            echo "Please add IBM_BOB_API_URL to the 'peacemaker' environment secrets"
            exit 1
          fi
          echo "✅ Secrets validated successfully"
        
      - name: Run Peacemaker Analysis
        id: peacemaker
        env:
          IBM_BOB_API_KEY: \${{ secrets.IBM_BOB_API_KEY }}
          IBM_BOB_API_URL: \${{ secrets.IBM_BOB_API_URL }}
        run: |
          # Run peacemaker in CI mode with JSON output
          npx peacemaker resolve \${{ github.head_ref }} \\
            --target \${{ github.base_ref }} \\
            --ci \\
            --output json > peacemaker-report.json || {
            echo "❌ Peacemaker analysis failed"
            echo '{"error": "Analysis failed", "validation": {"passed": false}}' > peacemaker-report.json
          }
          
          # Check exit code
          EXIT_CODE=$?
          echo "exit_code=$EXIT_CODE" >> $GITHUB_OUTPUT
          
          # Validate JSON output
          if ! jq empty peacemaker-report.json 2>/dev/null; then
            echo "❌ Invalid JSON output, creating error report"
            echo '{"error": "Invalid JSON output", "validation": {"passed": false}}' > peacemaker-report.json
          fi
          
          # Save report for comment
          cat peacemaker-report.json
          
      - name: Generate PR Comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            
            // Read Peacemaker report
            let report;
            try {
              const reportData = fs.readFileSync('peacemaker-report.json', 'utf8');
              report = JSON.parse(reportData);
            } catch (error) {
              console.error('Failed to read report:', error);
              // Create a fallback error report
              report = {
                error: 'Failed to generate report',
                validation: { passed: false }
              };
            }
            
            // Format comment (inline to avoid file dependency issues)
            const formatComment = (report) => {
              if (report.error) {
                return \`## ⚔️ PEACEMAKER ANALYSIS\\n\\n❌ **Error:** \${report.error}\\n\\nPlease check the workflow logs for details.\`;
              }
              
              const status = report.validation?.passed ? '✅ Passed' : '❌ Failed';
              const conflicts = report.conflicts?.length || 0;
              const importIssues = report.importIssues?.length || 0;
              const dependencyIssues = report.dependencyIssues?.length || 0;
              
              let comment = \`## ⚔️ PEACEMAKER ANALYSIS\\n\\n\`;
              comment += \`**Status:** \${status}\\n\\n\`;
              comment += \`### Summary\\n\`;
              comment += \`- **Conflicts:** \${conflicts}\\n\`;
              comment += \`- **Import Issues:** \${importIssues}\\n\`;
              comment += \`- **Dependency Issues:** \${dependencyIssues}\\n\\n\`;
              
              if (report.guidance?.summary) {
                comment += \`### AI Guidance\\n\${report.guidance.summary}\\n\\n\`;
              }
              
              if (report.validation?.errors?.length > 0) {
                comment += \`### Validation Errors\\n\`;
                report.validation.errors.forEach(err => {
                  comment += \`- \${err}\\n\`;
                });
                comment += \`\\n\`;
              }
              
              comment += \`---\\n\`;
              comment += \`*Analyzed by Peacemaker • [View Details](\${process.env.GITHUB_SERVER_URL}/\${process.env.GITHUB_REPOSITORY}/actions/runs/\${process.env.GITHUB_RUN_ID})*\`;
              
              return comment;
            };
            
            const comment = formatComment(report);
            
            // Find existing comment
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            
            const botComment = comments.find(comment => 
              comment.user.type === 'Bot' && 
              comment.body.includes('⚔️ PEACEMAKER ANALYSIS')
            );
            
            // Create or update comment
            if (botComment) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: botComment.id,
                body: comment
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: comment
              });
            }
            
      - name: Set Status Check
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            
            // Read report
            let report;
            try {
              const reportData = fs.readFileSync('peacemaker-report.json', 'utf8');
              report = JSON.parse(reportData);
            } catch (error) {
              console.error('Failed to read report:', error);
              return;
            }
            
            // Determine status
            const validation = report.validation || {};
            const guidance = report.guidance || {};
            
            let state = 'success';
            let description = 'Peacemaker analysis passed';
            
            if (!validation.passed) {
              state = 'failure';
              description = \`Pre-validation failed: \${validation.summary?.errorsFound || 0} errors found\`;
            } else if (guidance.recommendedAction?.priority === 'critical') {
              state = 'failure';
              description = 'Critical issues detected - manual review required';
            } else if (guidance.recommendedAction?.priority === 'high') {
              state = 'pending';
              description = 'High-priority issues detected - review recommended';
            }
            
            // Create status check
            await github.rest.repos.createCommitStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              sha: context.payload.pull_request.head.sha,
              state: state,
              target_url: \`https://github.com/\${context.repo.owner}/\${context.repo.repo}/actions/runs/\${context.runId}\`,
              description: description,
              context: 'Peacemaker Analysis'
            });
            
      - name: Upload Report Artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: peacemaker-report
          path: peacemaker-report.json
          retention-days: 30

# Made with Peacemaker
`;

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
    console.log('This will configure Peacemaker CI/CD integration in your repository.\n');

    // Check if already initialized
    const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'peacemaker.yml');
    const configPath = path.join(process.cwd(), '.peacemakerrc.json');

    let shouldProceed = true;
    if (isInteractive) {
      const existingFiles = [];
      try {
        await fs.access(workflowPath);
        existingFiles.push('GitHub workflow');
      } catch (e) { /* File doesn't exist */ }

      try {
        await fs.access(configPath);
        existingFiles.push('configuration file');
      } catch (e) { /* File doesn't exist */ }

      if (existingFiles.length > 0) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `Peacemaker ${existingFiles.join(' and ')} already exist. Overwrite?`,
            default: false,
          },
        ]);
        shouldProceed = overwrite;
      }
    }

    if (!shouldProceed) {
      console.log(chalk.yellow('\n✋ Setup cancelled.\n'));
      return;
    }

    // Create .github/workflows directory
    spinner.start('Creating GitHub workflow directory...');
    const workflowDir = path.join(process.cwd(), '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });
    spinner.succeed('GitHub workflow directory created');

    // Write workflow file
    spinner.start('Creating Peacemaker workflow...');
    await fs.writeFile(workflowPath, WORKFLOW_TEMPLATE, 'utf8');
    spinner.succeed('Peacemaker workflow created');

    // Write config file
    spinner.start('Creating configuration file...');
    await fs.writeFile(configPath, CONFIG_TEMPLATE, 'utf8');
    spinner.succeed('Configuration file created');

    // Success message
    console.log(chalk.bold.green('\n✅ Peacemaker setup complete!\n'));
    console.log(chalk.bold('Next steps:\n'));
    console.log('1. Create GitHub Environment and add secrets:');
    console.log(chalk.gray('   a. Go to: Settings → Environments'));
    console.log(chalk.gray('   b. Click "New environment"'));
    console.log(chalk.gray('   c. Name it: "peacemaker" (exactly as shown)'));
    console.log(chalk.gray('   d. Add these secrets to the environment:'));
    console.log(chalk.cyan('      - IBM_BOB_API_KEY'));
    console.log(chalk.cyan('      - IBM_BOB_API_URL\n'));
    console.log('2. Commit the new files:');
    console.log(chalk.gray('   git add .github/workflows/peacemaker.yml .peacemakerrc.json'));
    console.log(chalk.gray('   git commit -m "Add Peacemaker CI/CD integration"'));
    console.log(chalk.gray('   git push\n'));
    console.log('3. Open a pull request to test the integration!\n');
    console.log(chalk.dim('For more information, visit: https://github.com/fanifrancs/PEACEMAKER\n'));

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
