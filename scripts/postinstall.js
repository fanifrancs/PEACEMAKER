#!/usr/bin/env node

/**
 * Postinstall Script
 * Automatically sets up Peacemaker CI/CD integration after npm install
 */

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

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
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          
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
        
      - name: Run Peacemaker Analysis
        id: peacemaker
        env:
          IBM_BOB_API_KEY: \${{ secrets.IBM_BOB_API_KEY }}
          IBM_BOB_API_URL: \${{ secrets.IBM_BOB_API_URL }}
        run: |
          npx peacemaker resolve \${{ github.head_ref }} \\
            --target \${{ github.base_ref }} \\
            --ci \\
            --output json > peacemaker-report.json
          
      - name: Generate PR Comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            let report;
            try {
              const reportData = fs.readFileSync('peacemaker-report.json', 'utf8');
              report = JSON.parse(reportData);
            } catch (error) {
              console.error('Failed to read report:', error);
              return;
            }
            
            const formatComment = (report) => {
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
              
              comment += \`---\\n*Analyzed by Peacemaker*\`;
              return comment;
            };
            
            const comment = formatComment(report);
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            
            const botComment = comments.find(comment => 
              comment.user.type === 'Bot' && 
              comment.body.includes('⚔️ PEACEMAKER ANALYSIS')
            );
            
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
            let report;
            try {
              const reportData = fs.readFileSync('peacemaker-report.json', 'utf8');
              report = JSON.parse(reportData);
            } catch (error) {
              console.error('Failed to read report:', error);
              return;
            }
            
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

async function postinstall() {
  try {
    // Check if we're in the Peacemaker repo itself (skip setup)
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    
    if (packageJson.name === 'peacemaker') {
      // We're in the Peacemaker repo itself, skip postinstall
      return;
    }

    // Check if workflow already exists
    const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'peacemaker.yml');
    const configPath = path.join(process.cwd(), '.peacemakerrc.json');
    
    let workflowExists = false;
    let configExists = false;
    
    try {
      await fs.access(workflowPath);
      workflowExists = true;
    } catch (e) { /* File doesn't exist */ }
    
    try {
      await fs.access(configPath);
      configExists = true;
    } catch (e) { /* File doesn't exist */ }

    if (workflowExists && configExists) {
      // Already set up, skip
      return;
    }

    console.log(chalk.cyan('\n⚔️  Setting up Peacemaker CI/CD integration...\n'));

    // Create .github/workflows directory
    const workflowDir = path.join(process.cwd(), '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });

    // Write workflow file if it doesn't exist
    if (!workflowExists) {
      await fs.writeFile(workflowPath, WORKFLOW_TEMPLATE, 'utf8');
      console.log(chalk.green('✓ Created .github/workflows/peacemaker.yml'));
    }

    // Write config file if it doesn't exist
    if (!configExists) {
      await fs.writeFile(configPath, CONFIG_TEMPLATE, 'utf8');
      console.log(chalk.green('✓ Created .peacemakerrc.json'));
    }

    console.log(chalk.bold.green('\n✅ Peacemaker setup complete!\n'));
    console.log(chalk.bold('Next steps:\n'));
    console.log('1. Add GitHub secrets to your repository:');
    console.log(chalk.cyan('   - IBM_BOB_API_KEY'));
    console.log(chalk.cyan('   - IBM_BOB_API_URL\n'));
    console.log('2. Commit the new files:');
    console.log(chalk.gray('   git add .github/workflows/peacemaker.yml .peacemakerrc.json'));
    console.log(chalk.gray('   git commit -m "Add Peacemaker CI/CD integration"'));
    console.log(chalk.gray('   git push\n'));
    console.log('3. Open a pull request to test the integration!\n');
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
