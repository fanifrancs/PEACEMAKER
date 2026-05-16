# Troubleshooting Guide

Common issues and solutions for PEACEMAKER.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Configuration Issues](#configuration-issues)
- [Git Operation Errors](#git-operation-errors)
- [AI Service Errors](#ai-service-errors)
- [Validation Errors](#validation-errors)
- [Patch Application Issues](#patch-application-issues)
- [GitHub Actions Issues](#github-actions-issues)
- [Performance Issues](#performance-issues)

---

## Installation Issues

### Error: `npm install` fails

**Symptoms:**
```
npm ERR! code EACCES
npm ERR! syscall access
```

**Solutions:**

1. **Fix npm permissions:**
   ```bash
   sudo chown -R $USER:$(id -gn $USER) ~/.npm
   sudo chown -R $USER:$(id -gn $USER) ~/.config
   ```

2. **Use nvm (recommended):**
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 18
   nvm use 18
   ```

3. **Install without sudo:**
   ```bash
   npm install --prefix ~/.npm-global
   export PATH=~/.npm-global/bin:$PATH
   ```

### Error: `command not found: peacemaker`

**Symptoms:**
```bash
$ peacemaker --help
bash: peacemaker: command not found
```

**Solutions:**

1. **Check if installed globally:**
   ```bash
   npm list -g peacemaker
   ```

2. **Reinstall globally:**
   ```bash
   npm install -g peacemaker
   ```

3. **Use npx:**
   ```bash
   npx peacemaker --help
   ```

4. **Add to PATH (if installed from source):**
   ```bash
   export PATH="/path/to/PEACEMAKER/bin:$PATH"
   ```

---

## Configuration Issues

### Error: `IBM Bob API key not configured`

**Symptoms:**
```
⚠️  Configuration Required
Please set IBM_BOB_API_KEY in your .env file
```

**Solutions:**

1. **Create .env file:**
   ```bash
   cp .env.example .env
   ```

2. **Add API credentials:**
   ```env
   IBM_BOB_API_KEY=your_actual_api_key_here
   IBM_BOB_API_URL=https://api.ibm.com/bob/v1
   ```

3. **Verify configuration:**
   ```bash
   cat .env | grep IBM_BOB
   ```

4. **Check environment variables:**
   ```bash
   echo $IBM_BOB_API_KEY
   ```

### Error: `.env` file not found

**Symptoms:**
```
Error: ENOENT: no such file or directory, open '.env'
```

**Solutions:**

1. **Create .env in project root:**
   ```bash
   touch .env
   ```

2. **Use absolute path:**
   ```bash
   export IBM_BOB_API_KEY=your_key
   export IBM_BOB_API_URL=https://api.ibm.com/bob/v1
   ```

3. **Check current directory:**
   ```bash
   pwd  # Should be in project root
   ls -la .env
   ```

---

## Git Operation Errors

### Error: `Not a git repository`

**Symptoms:**
```
✗ Not a git repository
```

**Solutions:**

1. **Initialize git repository:**
   ```bash
   git init
   ```

2. **Check if in correct directory:**
   ```bash
   pwd
   git status
   ```

3. **Clone repository:**
   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```

### Error: `Branch not found`

**Symptoms:**
```
Error: Branch 'feature-branch' not found
```

**Solutions:**

1. **List available branches:**
   ```bash
   git branch -a
   ```

2. **Fetch remote branches:**
   ```bash
   git fetch --all
   ```

3. **Check branch name spelling:**
   ```bash
   peacemaker analyze feature/new-feature  # Not feature-new-feature
   ```

4. **Create branch if needed:**
   ```bash
   git checkout -b feature-branch
   ```

### Error: `Merge conflict detected`

**Symptoms:**
```
✗ Merge conflict detected
Cannot proceed with automatic merge
```

**Solutions:**

1. **Use resolve command:**
   ```bash
   peacemaker resolve --target main
   ```

2. **Review conflicts:**
   ```bash
   git status
   git diff
   ```

3. **Manual resolution if Tier 3:**
   ```bash
   git merge main
   # Resolve conflicts manually
   git add .
   git commit
   ```

---

## AI Service Errors

### Error: `API request failed`

**Symptoms:**
```
Error: API request failed: 401 Unauthorized
```

**Solutions:**

1. **Verify API key:**
   ```bash
   echo $IBM_BOB_API_KEY
   ```

2. **Check API URL:**
   ```bash
   echo $IBM_BOB_API_URL
   ```

3. **Test API connection:**
   ```bash
   curl -H "Authorization: Bearer $IBM_BOB_API_KEY" $IBM_BOB_API_URL/health
   ```

4. **Regenerate API key:**
   - Log into IBM Bob dashboard
   - Generate new API key
   - Update .env file

### Error: `Request timeout`

**Symptoms:**
```
Error: Request timeout after 30000ms
```

**Solutions:**

1. **Increase timeout:**
   ```bash
   export PEACEMAKER_TIMEOUT=60000
   ```

2. **Check network connection:**
   ```bash
   ping api.ibm.com
   ```

3. **Use smaller batch size:**
   ```bash
   peacemaker resolve --skip-validation
   ```

4. **Retry request:**
   ```bash
   peacemaker resolve  # Retry with exponential backoff
   ```

### Error: `Rate limit exceeded`

**Symptoms:**
```
Error: Rate limit exceeded. Retry after 60 seconds
```

**Solutions:**

1. **Wait and retry:**
   ```bash
   sleep 60
   peacemaker resolve
   ```

2. **Use CI mode for batch processing:**
   ```bash
   peacemaker resolve --ci
   ```

3. **Upgrade API plan:**
   - Contact IBM Bob support
   - Request higher rate limits

---

## Validation Errors

### Error: `Syntax validation failed`

**Symptoms:**
```
✗ Syntax validation failed
src/app.js: Unexpected token
```

**Solutions:**

1. **Check syntax errors:**
   ```bash
   node --check src/app.js
   ```

2. **Fix syntax errors:**
   ```javascript
   // Before (error)
   const x = 
   
   // After (fixed)
   const x = 5;
   ```

3. **Skip validation temporarily:**
   ```bash
   peacemaker resolve --skip-validation
   ```

4. **Use basic validation level:**
   ```bash
   peacemaker resolve --validation-level basic
   ```

### Error: `Import path does not exist`

**Symptoms:**
```
✗ Import path does not exist: ../utils/helper
```

**Solutions:**

1. **Check file exists:**
   ```bash
   ls -la src/utils/helper.js
   ```

2. **Fix import path:**
   ```javascript
   // Before
   import { helper } from '../utils/helper';
   
   // After
   import { helper } from '../utils/helpers';
   ```

3. **Use peacemaker to fix:**
   ```bash
   peacemaker resolve  # Will suggest import fixes
   ```

### Error: `Dependency not found`

**Symptoms:**
```
⚠️  Dependency react@^18.0.0 may not be installed
```

**Solutions:**

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Check package.json:**
   ```bash
   cat package.json | grep react
   ```

3. **Install specific package:**
   ```bash
   npm install react@^18.0.0
   ```

---

## Patch Application Issues

### Error: `No patches found`

**Symptoms:**
```
✗ No patches found
Run `peacemaker resolve` first to generate patches
```

**Solutions:**

1. **Generate patches first:**
   ```bash
   peacemaker resolve
   # Approve suggestions
   ```

2. **Check patches directory:**
   ```bash
   ls -la .peacemaker/
   cat .peacemaker/patches.json
   ```

3. **Specify patch file:**
   ```bash
   peacemaker apply .peacemaker/patches.json
   ```

### Error: `Patch application failed`

**Symptoms:**
```
✗ Failed to apply patch: src/app.js
Error: No conflict markers found
```

**Solutions:**

1. **Check file state:**
   ```bash
   git status
   git diff src/app.js
   ```

2. **Revert changes:**
   ```bash
   git checkout src/app.js
   ```

3. **Regenerate patches:**
   ```bash
   peacemaker resolve
   peacemaker apply
   ```

4. **Use dry-run:**
   ```bash
   peacemaker apply --dry-run
   ```

### Error: `Conflict markers not found`

**Symptoms:**
```
Error: No conflict markers found in src/app.js
```

**Solutions:**

1. **Check if conflicts exist:**
   ```bash
   grep -n "<<<<<<< HEAD" src/app.js
   ```

2. **Simulate merge again:**
   ```bash
   git merge --no-commit main
   ```

3. **Manual resolution:**
   ```bash
   # Edit file manually
   git add src/app.js
   ```

---

## GitHub Actions Issues

### Error: `Workflow not triggered`

**Symptoms:**
- PR opened but no Peacemaker comment

**Solutions:**

1. **Check workflow file:**
   ```bash
   cat .github/workflows/peacemaker.yml
   ```

2. **Verify triggers:**
   ```yaml
   on:
     pull_request:
       types: [opened, synchronize, reopened]
   ```

3. **Check Actions tab:**
   - Go to repository → Actions
   - Look for failed runs
   - Check error logs

4. **Verify permissions:**
   ```yaml
   permissions:
     contents: read
     pull-requests: write
   ```

### Error: `Secrets not found`

**Symptoms:**
```
Error: IBM_BOB_API_KEY is not set
```

**Solutions:**

1. **Add repository secrets:**
   - Go to Settings → Secrets and variables → Actions
   - Add `IBM_BOB_API_KEY`
   - Add `IBM_BOB_API_URL`

2. **Verify secret names:**
   ```yaml
   env:
     IBM_BOB_API_KEY: ${{ secrets.IBM_BOB_API_KEY }}
   ```

3. **Check secret access:**
   - Secrets must be added to repository
   - Not available in forked PRs (security)

### Error: `Comment not posted`

**Symptoms:**
- Workflow runs successfully
- No comment on PR

**Solutions:**

1. **Check permissions:**
   ```yaml
   permissions:
     pull-requests: write
   ```

2. **Verify GitHub token:**
   ```yaml
   - uses: actions/github-script@v7
     with:
       github-token: ${{ secrets.GITHUB_TOKEN }}
   ```

3. **Check comment script:**
   ```bash
   cat .github/scripts/format-comment.js
   ```

---

## Performance Issues

### Issue: Slow validation

**Symptoms:**
- Validation takes > 30 seconds
- Timeout errors

**Solutions:**

1. **Use basic validation:**
   ```bash
   peacemaker resolve --validation-level basic
   ```

2. **Skip validation:**
   ```bash
   peacemaker resolve --skip-validation
   ```

3. **Reduce file count:**
   ```bash
   # Add to .peacemakerrc.json
   {
     "excludePatterns": ["*.md", "docs/**", "tests/**"]
   }
   ```

4. **Increase timeout:**
   ```bash
   export PEACEMAKER_TIMEOUT=60000
   ```

### Issue: High memory usage

**Symptoms:**
- Process killed
- Out of memory errors

**Solutions:**

1. **Increase Node.js memory:**
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

2. **Process files in batches:**
   ```bash
   # Split large PRs into smaller ones
   ```

3. **Clear cache:**
   ```bash
   rm -rf .peacemaker/cache
   ```

---

## Debug Mode

Enable debug logging for detailed information:

```bash
export PEACEMAKER_LOG_LEVEL=debug
peacemaker resolve
```

This will show:
- API requests and responses
- File operations
- Validation details
- Error stack traces

---

## Getting Help

If you're still experiencing issues:

1. **Check existing issues:**
   - [GitHub Issues](https://github.com/fanifrancs/PEACEMAKER/issues)

2. **Create new issue:**
   - Include error message
   - Include debug logs
   - Include environment details:
     ```bash
     node --version
     npm --version
     git --version
     peacemaker --version
     ```

3. **Ask in discussions:**
   - [GitHub Discussions](https://github.com/fanifrancs/PEACEMAKER/discussions)

---

## Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| `ENOENT` | File not found | Check file path |
| `EACCES` | Permission denied | Fix file permissions |
| `ETIMEDOUT` | Request timeout | Check network, increase timeout |
| `401` | Unauthorized | Check API key |
| `403` | Forbidden | Check API permissions |
| `429` | Rate limit | Wait and retry |
| `500` | Server error | Retry later, contact support |

---

For more help, see:
- [README.md](../README.md)
- [API Documentation](API.md)
- [Contributing Guide](../CONTRIBUTING.md)