# GitHub Actions Setup for PEACEMAKER

This directory contains the GitHub Actions workflow for automated PEACEMAKER analysis on pull requests.

## 🔧 Setup Instructions

### 1. Configure Repository Secrets

Navigate to your repository settings and add the following secrets:

**Settings → Secrets and variables → Actions → New repository secret**

#### Required Secrets:

1. **`IBM_BOB_API_KEY`**
   - Your IBM Bob API key for AI-powered analysis
   - Get your key from: [IBM Bob API Portal]
   - Example: `sk-proj-abc123...`

2. **`IBM_BOB_API_URL`** (Optional)
   - Custom IBM Bob API endpoint URL
   - Default: Uses standard IBM Bob API endpoint
   - Example: `https://api.ibm-bob.com/v1`

### 2. Enable Workflow Permissions

Ensure the workflow has the necessary permissions:

**Settings → Actions → General → Workflow permissions**

- ✅ Read and write permissions
- ✅ Allow GitHub Actions to create and approve pull requests

### 3. Workflow Triggers

The workflow automatically runs on:
- Pull request opened
- Pull request synchronized (new commits pushed)
- Pull request reopened

Target branches:
- `main`
- `develop`

### 4. Workflow Outputs

The workflow provides:

1. **PR Comment** - Detailed analysis report posted as a comment
2. **Status Check** - Pass/fail status visible in PR checks
3. **Artifact** - JSON report downloadable for 30 days

## 📊 Understanding the Analysis

### Status Indicators

- ✅ **Success** - Pre-validation passed, no critical issues
- ⚠️ **Pending** - High-priority issues detected, review recommended
- ❌ **Failure** - Pre-validation failed or critical issues found

### Report Sections

1. **Summary** - Files analyzed, errors/warnings count, duration
2. **AI Guidance** - Developer intent, component analysis, recommendations
3. **Validation Errors** - Syntax errors, import issues, type errors
4. **Warnings** - Non-blocking issues that should be reviewed
5. **Confidence Score** - Overall confidence in AI suggestions
6. **Next Steps** - Recommended actions based on analysis

## 🔍 Local Testing

Test the workflow locally before pushing:

```bash
# Install dependencies
npm ci

# Run Peacemaker in CI mode
npm run peacemaker -- resolve feature-branch \
  --target main \
  --ci \
  --output json > report.json

# View report
cat report.json
```

## 🐛 Troubleshooting

### Workflow Fails with "API Key Not Configured"

**Solution**: Ensure `IBM_BOB_API_KEY` secret is set in repository settings.

### Workflow Fails with "Not a git repository"

**Solution**: The workflow automatically fetches all history. If this fails, check repository permissions.

### PR Comment Not Posted

**Solution**: 
1. Check workflow permissions (read/write access)
2. Verify the bot has permission to comment on PRs
3. Check workflow logs for errors

### Status Check Not Appearing

**Solution**:
1. Ensure workflow has permission to create commit statuses
2. Check that the workflow completed successfully
3. Verify the SHA matches the PR head commit

## 📝 Customization

### Modify Trigger Branches

Edit `.github/workflows/peacemaker.yml`:

```yaml
on:
  pull_request:
    branches:
      - main
      - develop
      - staging  # Add more branches
```

### Adjust Validation Level

Modify the workflow command:

```yaml
npm run peacemaker -- resolve ${{ github.head_ref }} \
  --target ${{ github.base_ref }} \
  --validation-level strict \  # basic, strict, or comprehensive
  --ci \
  --output json > peacemaker-report.json
```

### Change Report Retention

Modify artifact retention:

```yaml
- name: Upload Report Artifact
  uses: actions/upload-artifact@v4
  with:
    retention-days: 90  # Change from 30 to 90 days
```

## 🔐 Security Best Practices

1. **Never commit API keys** - Always use repository secrets
2. **Limit workflow permissions** - Only grant necessary permissions
3. **Review workflow changes** - Carefully review any changes to workflow files
4. **Rotate keys regularly** - Update API keys periodically
5. **Monitor usage** - Check workflow logs for suspicious activity

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Managing Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [PEACEMAKER Documentation](../README.md)

## 🆘 Support

If you encounter issues:

1. Check workflow logs in Actions tab
2. Review this setup guide
3. Open an issue in the repository
4. Contact the PEACEMAKER team

---

*Last updated: May 16, 2026*