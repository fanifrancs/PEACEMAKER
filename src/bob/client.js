const { execSync } = require('child_process');
const { spawnSync } = require('child_process');
const logger = require('../utils/logger');
const path = require('path');
const os = require('os');
const INTENT_CACHE_PATH = path.join(os.homedir(), '.peacemaker-intent-cache.json');

require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class BobClient {
  constructor() {
    this.apiKey = process.env.BOBSHELL_API_KEY;
    this.maxRetries = parseInt(process.env.PEACEMAKER_MAX_RETRIES || '1');
    this.bobPath = null;

    if (!this.apiKey) {
      logger.warn('BOBSHELL_API_KEY not set - Bob integration will not work');
    }

    logger.info('Bob Shell client initialized');
  }

  _getBobPath() {
    if (this.bobPath) return this.bobPath;

    const fs = require('fs');
    const possiblePaths = [
      `${process.env.HOME}/.nvm/versions/node/v22.22.2/bin/bob`,
      `${process.env.HOME}/.nvm/versions/node/${process.version}/bin/bob`,
      `${process.env.HOME}/.nvm/versions/node/v20.19.0/bin/bob`,
      `${process.env.HOME}/.npm-global/bin/bob`,
      '/usr/local/bin/bob',
      '/usr/bin/bob',
    ];

    for (const bobPath of possiblePaths) {
      try {
        if (fs.existsSync(bobPath)) {
          this.bobPath = bobPath;
          logger.info(`Bob found at: ${this.bobPath}`);
          return this.bobPath;
        }
      } catch (e) { /* continue */ }
    }

    throw new Error('Bob Shell not found. Please install Bob Shell first.');
  }

  /**
   * Execute Bob Shell with prompt as positional argument (one-shot mode).
   * Bob exits automatically after responding — no stdin, no interactive mode.
   */
  async _executeBobShell(prompt, progressCallback = null) {
    const bobPath = this._getBobPath();

    if (progressCallback) progressCallback('Sending prompt to Bob Shell...');
    logger.info('[Bob Shell] Sending prompt to Bob Shell...');

    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');

      const bobProcess = spawn(
        bobPath,
        [prompt, '--yolo', '--hide-intermediary-output'],
        {
          env: {
            ...process.env,
            BOBSHELL_API_KEY: this.apiKey,
            PATH: `${path.dirname(bobPath)}:${process.env.PATH}`
          },
          stdio: ['ignore', 'pipe', 'pipe'] // ignore stdin — one-shot mode
        }
      );

      let stdout = '';
      let stderr = '';

      // Progress ticker
      let elapsed = 0;
      const progressTimer = setInterval(() => {
        elapsed += 10;
        if (progressCallback) progressCallback(`Bob Shell processing... (${elapsed}s elapsed)`);
        logger.info(`[Bob Shell] Bob Shell processing... (${elapsed}s elapsed)`);
      }, 10000);

      // 5-minute hard timeout
      const timeout = setTimeout(() => {
        clearInterval(progressTimer);
        bobProcess.kill();
        reject(new Error('Bob Shell execution timed out after 5 minutes'));
      }, 300000);

      bobProcess.stdout.on('data', d => { stdout += d.toString(); });
      bobProcess.stderr.on('data', d => { stderr += d.toString(); });

      bobProcess.on('close', code => {
        clearTimeout(timeout);
        clearInterval(progressTimer);

        logger.info('[Bob Shell] Bob Shell response received');
        logger.debug(`Bob stdout (first 300): ${stdout.substring(0, 300)}`);

        // Bob exits 0 on success, non-zero on error
        // stderr often has harmless deprecation warnings — only reject on real errors
        const isRealError = stderr.includes('expired') ||
                            stderr.includes('Upgrade your plan') ||
                            stderr.includes('error') && code !== 0;

        if (isRealError) {
          reject(new Error(`Bob Shell error: ${stderr.substring(0, 300)}`));
          return;
        }

        // stdout IS the response in one-shot mode (no ---output--- markers needed)
        const output = stdout.trim();
        if (!output) {
          reject(new Error('Bob Shell returned empty response'));
          return;
        }

        resolve(output);
      });

      bobProcess.on('error', error => {
        clearTimeout(timeout);
        clearInterval(progressTimer);
        reject(new Error(`Bob Shell execution failed: ${error.message}`));
      });
    });
  }

  async mergeFileContent({ filePath, intent, baseContent, mainContent, featureContent }) {
    const buildPrompt = (retryContext = '') => `You are resolving ONE overlapping file for Peacemaker.

Your task: return the COMPLETE final merged file content for:
${filePath}

Hard output contract:
- Put the final file content between these exact markers:
<PEACEMAKER_FILE>
...complete file content here...
</PEACEMAKER_FILE>
- Do not summarize.
- Do not explain.
- Do not use markdown fences.
- Do not say "merged successfully".
- Do not edit files yourself.
- Preserve latest main behavior.
- Apply the feature branch intent.

${retryContext}

Intent:
${JSON.stringify(intent, null, 2)}

===== BASE VERSION =====
${baseContent}

===== LATEST MAIN VERSION =====
${mainContent}

===== FEATURE VERSION =====
${featureContent}
`;

    let lastError = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const retryContext = attempt === 1 ? '' : `Previous attempt failed because it did not return raw file content. This time return ONLY the tagged full file content.`;
      const response = await this._executeBobShell(buildPrompt(retryContext));
      let content = this._extractTaggedFileContent(response);

      if (!content) {
        lastError = new Error(`Bob response missing <PEACEMAKER_FILE> tagged content for ${filePath}`);
        logger.warn(`[Bob Merge] Invalid merged content for ${filePath} on attempt ${attempt}: ${lastError.message}`);
        continue;
      }

      const fenceMatch = content.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```\s*$/);
      if (fenceMatch) {
        content = fenceMatch[1];
      }

      try {
        this._validateMergedFileContent(filePath, content);
        return content.endsWith('\n') ? content : content + '\n';
      } catch (error) {
        lastError = error;
        logger.warn(`[Bob Merge] Invalid merged content for ${filePath} on attempt ${attempt}: ${error.message}`);
      }
    }

    throw lastError || new Error(`Bob could not produce valid merged content for ${filePath}`);
  }


  async mergeFileDirectly({ filePath, baseContent, mainContent, featureContent, intent }) {
    const fsp = require('fs').promises;
    const absPath = require('path').isAbsolute(filePath) ? filePath : require('path').join(process.cwd(), filePath);

    const prompt = `You are resolving a merge conflict for a single file.

Your ONLY job: write the merged result to disk at the exact path below.

FILE TO WRITE: ${absPath}

RULES:
- Start with LATEST MAIN VERSION as your base
- Add all imports and routes/endpoints from FEATURE VERSION that are not already in LATEST MAIN
- Do not remove any existing functionality from either version
- Do not summarize or explain — just write the file
- Do not duplicate semicolons — every statement ends with exactly one semicolon

INTENT: ${JSON.stringify(intent || 'Merge both sets of changes, preserving all functionality from both branches.', null, 2)}

===== BASE VERSION (common ancestor at fork point) =====
${baseContent}

===== LATEST MAIN VERSION (preserve everything here) =====
${mainContent}

===== FEATURE VERSION (add its new additions to main) =====
${featureContent}

Write the merged file to ${absPath} now.`;

    const statBefore = await fsp.stat(absPath).catch(() => null);
    const mtimeBefore = statBefore ? statBefore.mtimeMs : null;

    await this._executeBobShell(prompt);

    const statAfter = await fsp.stat(absPath).catch(() => null);
    if (!statAfter) {
      throw new Error(`Bob did not create ${absPath}`);
    }
    if (mtimeBefore !== null && statAfter.mtimeMs === mtimeBefore) {
      throw new Error(`Bob did not modify ${absPath} (mtime unchanged — file not written)`);
    }

    let content = await fsp.readFile(absPath, 'utf8');
    // Post-process: remove any duplicate semicolons Bob may have introduced
    content = content.replace(/;;+/g, ';');
    if (!content.endsWith('\n')) content += '\n';
    logger.info(`[Bob Merge] Bob wrote ${absPath} directly (${content.split('\n').length} lines)`);
    return content;
  }

  _extractTaggedFileContent(response) {
    const match = response.match(/<PEACEMAKER_FILE>\s*\n?([\s\S]*?)\n?<\/PEACEMAKER_FILE>/);
    return match ? match[1] : null;
  }


  _validateMergedFileContent(filePath, content) {
    const trimmed = content.trim();

    if (!trimmed) {
      throw new Error(`Bob returned empty merged content for ${filePath}`);
    }

    const prosePatterns = [
      /^merged\s+/i,
      /^here(?:'s| is)\s+/i,
      /^the file now includes/i,
      /^the complete merged file content/i,
      /^the complete file content/i,
      /^the final file/i,
      /has been provided between/i,
      /^i (?:have|merged|updated)\s+/i,
      /^successfully\s+/i,
      /^[-*]\s+/m
    ];

    if (prosePatterns.some(pattern => pattern.test(trimmed))) {
      throw new Error(`Bob returned prose instead of file content for ${filePath}`);
    }

    if (/\.jsx?$|\.tsx?$/.test(filePath)) {
      const firstMeaningfulLine = trimmed
        .split('\n')
        .map(line => line.trim())
        .find(line => line && !line.startsWith('//') && !line.startsWith('*'));

      const validFirstLine = /^(#!|import\b|export\b|const\b|let\b|var\b|function\b|class\b|module\.exports\b|require\(|['\"]use strict['\"])/.test(firstMeaningfulLine || '');

      if (!validFirstLine) {
        throw new Error(`Bob output does not start like JavaScript/TypeScript content for ${filePath}`);
      }

      const codeSignals = [
        /\b(import|export|require|module\.exports|const|let|var|function|class)\b/,
        /=>/,
        /<\w+/
      ];

      if (!codeSignals.some(pattern => pattern.test(trimmed))) {
        throw new Error(`Bob output does not look like JavaScript/TypeScript content for ${filePath}`);
      }
    }

    if (/(^|\n)<<<<<<<[ \t]/.test(content) || /(^|\n)>>>>>>>[ \t]/.test(content)) {
      throw new Error(`Bob output still contains conflict markers for ${filePath}`);
    }
  }

  _stripMarkdownProse(response) {
    // Simple fence stripper for prose responses — no JSON parsing attempted
    return response
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/^```$/gm, '')
      .trim();
  }

  _stripMarkdown(response) {
    let cleaned = response.trim();
    
    // Strip markdown fences
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
    cleaned = cleaned.trim();
    
    // If Bob returned prose instead of JSON, try multiple extraction strategies
    if (!cleaned.startsWith('{')) {
      // Strategy 1: Find the first complete JSON object
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      } else {
        // Strategy 2: Look for JSON after common prose patterns
        const afterPattern = cleaned.match(/(?:here is|here's|result:|output:)\s*(\{[\s\S]*\})/i);
        if (afterPattern) {
          cleaned = afterPattern[1];
        } else {
          // Strategy 3: Extract everything between first { and last }
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          } else {
            throw new Error('Bob returned prose instead of JSON: ' + cleaned.substring(0, 100));
          }
        }
      }
    }
    
    return cleaned.trim();
  }

  async extractIntent(context) {
    logger.info('Extracting intent from branch...');

    const cacheKey = this._intentCacheKey(context);
    const cached = this._readIntentCache(cacheKey);
    if (cached) {
      logger.info(`[Cache] Intent cache hit for ${cacheKey}`);
      return { ...cached, _fromCache: true };
    }

    try {
      const prompt = this._buildIntentExtractionPrompt(context);
      const response = await this._executeBobShell(prompt);
      const cleanResponse = this._stripMarkdown(response);
      const intent = JSON.parse(cleanResponse);
      const result = {
        summary: intent.summary || 'No summary available',
        goals: intent.goals || [],
        keyChanges: intent.keyChanges || [],
        technicalApproach: intent.technicalApproach || '',
        confidence: intent.confidence || 'medium'
      };
      this._writeIntentCache(cacheKey, result);
      return result;
    } catch (error) {
      logger.error(`Intent extraction failed: ${error.message}`);
      throw new Error(`Failed to extract intent: ${error.message}`);
    }
  }

  _intentCacheKey(context) {
    const branch = context.branch || 'unknown';
    const headHash = ((context.commits && context.commits[0] && context.commits[0].hash) || 'unknown').substring(0, 7);
    return `${branch}:${headHash}`;
  }

  _readIntentCache(key) {
    try {
      const fs = require('fs');
      if (!fs.existsSync(INTENT_CACHE_PATH)) return null;
      const cache = JSON.parse(fs.readFileSync(INTENT_CACHE_PATH, 'utf8'));
      return cache[key] || null;
    } catch {
      return null;
    }
  }

  _writeIntentCache(key, value) {
    try {
      const fs = require('fs');
      let cache = {};
      try {
        if (fs.existsSync(INTENT_CACHE_PATH)) {
          cache = JSON.parse(fs.readFileSync(INTENT_CACHE_PATH, 'utf8'));
        }
      } catch {}
      cache[key] = value;
      // Keep cache bounded: trim to 40 entries if over 50
      const keys = Object.keys(cache);
      if (keys.length > 50) {
        for (const old of keys.slice(0, keys.length - 40)) delete cache[old];
      }
      fs.writeFileSync(INTENT_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
      logger.info(`[Cache] Intent cached for ${key}`);
    } catch (err) {
      logger.warn(`[Cache] Could not write intent cache: ${err.message}`);
    }
  }

  async replayIntent(intent, freshBranchContext, errorContext = null, seedFiles = null, options = {}) {
    logger.info('Replaying intent onto fresh branch...');

    const repoRoot = process.cwd();

    // Snapshot BEFORE Bob runs
    const before = this._snapshotDir(repoRoot);

    // Write seed files directly — bypass Bob for pre-existing file modifications
    // These are written after the before snapshot so they appear in the after diff
    const fsp = require('fs').promises;
    if (seedFiles && Object.keys(seedFiles).length > 0) {
      for (const [filePath, content] of Object.entries(seedFiles)) {
        const absPath = path.isAbsolute(filePath) ? filePath : require('path').join(repoRoot, filePath);
        await fsp.mkdir(require('path').dirname(absPath), { recursive: true });
        await fsp.writeFile(absPath, content, 'utf8');
        logger.info(`[Seed] Wrote directly (bypassing Bob): ${absPath}`);
      }
    }

    // Handle deletions from the feature branch
    for (const filePath of (options.seedDeletes || [])) {
      const absPath = path.isAbsolute(filePath) ? filePath : require('path').join(repoRoot, filePath);
      try {
        await fsp.unlink(absPath);
        logger.info(`[Seed] Deleted (feature branch deletion): ${filePath}`);
      } catch (e) {
        if (e.code !== 'ENOENT') logger.warn(`[Seed] Could not delete ${filePath}: ${e.message}`);
      }
    }

    // Handle binary files — copy raw bytes from feature branch via git show
    const binaryFiles = options.binaryFiles || [];
    const featureBranch = options.featureBranch;
    if (binaryFiles.length > 0 && featureBranch) {
      const { execSync: execSyncBin } = require('child_process');
      for (const filePath of binaryFiles) {
        const absPath = path.isAbsolute(filePath) ? filePath : require('path').join(repoRoot, filePath);
        try {
          require('fs').mkdirSync(require('path').dirname(absPath), { recursive: true });
          const buf = execSyncBin(`git show ${featureBranch}:${filePath}`, { cwd: repoRoot, encoding: 'buffer' });
          require('fs').writeFileSync(absPath, buf);
          logger.info(`[Seed] Copied binary file from ${featureBranch}: ${filePath}`);
        } catch (e) {
          logger.warn(`[Seed] Could not copy binary file ${filePath}: ${e.message}`);
        }
      }
    }

    try {
      let response = 'Skipped Bob replay mutation; Peacemaker wrote deterministic file changes.';
      if (!options.skipBobReplay) {
        const prompt = this._buildReplayPrompt(intent, freshBranchContext, errorContext, repoRoot);
        const progressCallback = msg => logger.info(`[Bob Shell] ${msg}`);

        // Tell Bob to write files — capture what it actually wrote via filesystem diff
        response = await this._executeBobShell(prompt, progressCallback);
        logger.debug(`Bob response (first 200): ${response.substring(0, 200)}`);
      } else {
        logger.info('[Replay] Skipping Bob file mutation step; using Peacemaker deterministic writes');
      }

      // Snapshot AFTER replay writes
      const after = this._snapshotDir(repoRoot);

      // Diff is the source of truth — no JSON parsing needed
      const changes = this._buildChangesFromDiff(before, after, repoRoot);
      // Relabel files that were preserved from main (not modified by feature) as 'preserve'
      const preservedSet = new Set(options.preservedFiles || []);
      for (const change of changes) {
        if (preservedSet.has(change.filePath) && change.operation === 'modify') {
          change.operation = 'preserve';
        }
      }
      // Relabel intentional feature-branch deletions vs files that are just missing/unwritten
      const intentionalDeletes = new Set(options.seedDeletes || []);
      for (const change of changes) {
        if (change.operation === 'delete') {
          change.operation = intentionalDeletes.has(change.filePath) ? 'delete' : 'missing';
        }
      }
      logger.info(`Filesystem diff detected ${changes.length} replay change(s)`);

      if (changes.length === 0) {
        logger.warn('Replay wrote nothing to disk — seed generation may need adjustment');
      }

      return {
        changes,
        before,
        reasoning: response.substring(0, 500),
        warnings: changes.length === 0 ? ['Replay wrote no files to disk'] : [],
        confidence: changes.length > 0 ? 'high' : 'low',
        _source: 'filesystem-diff'
      };

    } catch (error) {
      logger.error(`Intent replay failed: ${error.message}`);
      throw new Error(`Failed to replay intent: ${error.message}`);
    }
  }

  // Snapshot all files recursively — returns Map<relativePath, mtimeMs>
  _snapshotDir(dir) {
    const snap = new Map();
    const ignore = new Set(['.git', '.bob', 'node_modules', 'peacemaker.log']);
    const walk = (current) => {
      let entries;
      try { entries = require('fs').readdirSync(current, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (ignore.has(e.name)) continue;
        const full = require('path').join(current, e.name);
        if (e.isDirectory()) { walk(full); }
        else {
          const rel = require('path').relative(dir, full);
          try { snap.set(rel, require('fs').statSync(full).mtimeMs); } catch {}
        }
      }
    };
    walk(dir);
    return snap;
  }

  // Build changes array by comparing before/after snapshots
  _buildChangesFromDiff(before, after, repoRoot) {
    const changes = [];
    for (const [rel, mtime] of after) {
      const op = !before.has(rel) ? 'create' : before.get(rel) !== mtime ? 'modify' : null;
      if (!op) continue;
      let content = '';
      try { content = require('fs').readFileSync(require('path').join(repoRoot, rel), 'utf8'); } catch {}
      changes.push({ filePath: rel, operation: op, content, reasoning: 'Applied by Bob' });
    }
    for (const rel of before.keys()) {
      if (!after.has(rel)) {
        changes.push({ filePath: rel, operation: 'delete', content: '', reasoning: 'Deleted by Bob' });
      }
    }
    return changes;
  }

  async verifyChanges(changes, context) {
    logger.info('Verifying generated changes...');
    try {
      const prompt = this._buildVerificationPrompt(changes, context);
      const response = await this._executeBobShell(prompt);
      const cleanResponse = this._stripMarkdown(response);
      const verification = JSON.parse(cleanResponse);
      return {
        passed: verification.passed || false,
        issues: verification.issues || [],
        warnings: verification.warnings || [],
        confidence: verification.confidence || 'medium'
      };
    } catch (error) {
      logger.error(`Verification failed: ${error.message}`);
      throw new Error(`Failed to verify changes: ${error.message}`);
    }
  }

  async analyzeError(issues, context) {
    logger.info('Analyzing verification errors...');
    try {
      const prompt = this._buildErrorAnalysisPrompt(issues, context);
      const response = await this._executeBobShell(prompt);
      const cleanResponse = this._stripMarkdown(response);
      const analysis = JSON.parse(cleanResponse);
      return {
        rootCause: analysis.rootCause || 'Unknown',
        suggestions: analysis.suggestions || [],
        fixStrategy: analysis.fixStrategy || ''
      };
    } catch (error) {
      logger.error(`Error analysis failed: ${error.message}`);
      throw new Error(`Failed to analyze error: ${error.message}`);
    }
  }

  _buildIntentExtractionPrompt(context) {
    const { prTitle, prDescription, commits, developerInput, changedFiles, fileContents } = context;
    const fileList = changedFiles.slice(0, 15);
    const hasMore = changedFiles.length > 15;

    // Include actual file contents for key files so Bob understands what changed
    let fileContentSection = '';
    if (fileContents && Object.keys(fileContents).length > 0) {
      const entries = Object.entries(fileContents).slice(0, 8);
      fileContentSection = '\nFILE CONTENTS (feature branch):\n' +
        entries.map(([p, c]) => `--- ${p} ---\n${c.substring(0, 800)}`).join('\n\n');
    }

    return `You are an expert at understanding developer intent from code changes. Analyze the provided context and extract the CORE INTENT — what problem was the developer solving, not just what files they changed.

${developerInput ? `DEVELOPER SAYS: "${developerInput}" — weight this heavily in your analysis.` : ''}
PR Title: ${prTitle || 'N/A'}
PR Description: ${prDescription || 'N/A'}

Commits (${commits.length} total, most recent first):
${commits.slice(0, 10).map(c => `- ${c.message} (${c.hash.substring(0, 7)})`).join('\n')}
${commits.length > 10 ? `... and ${commits.length - 10} more commits` : ''}

Changed Files (${changedFiles.length} total):
${fileList.join('\n')}
${hasMore ? `... and ${changedFiles.length - 15} more files` : ''}
${fileContentSection}

RULES — YOU MUST FOLLOW THESE EXACTLY:
1. Your response must contain ONLY a JSON object. Nothing else.
2. Do NOT write any text before the opening {
3. Do NOT write any text after the closing }
4. Do NOT use markdown code fences (\`\`\`json or \`\`\`)
5. Do NOT explain your reasoning outside the JSON

RESPOND WITH THIS EXACT JSON STRUCTURE:
{
  "summary": "One sentence: what feature or fix does this branch deliver?",
  "goals": ["Specific goal 1", "Specific goal 2"],
  "keyChanges": ["Concrete change 1 (e.g. added POST /register endpoint)", "Concrete change 2"],
  "technicalApproach": "How was it implemented technically?",
  "confidence": "high|medium|low"
}`;
  }

  _buildReplayPrompt(intent, freshBranchContext, errorContext, repoRoot = process.cwd()) {
    const { relevantFiles = [], changedFiles = [] } = freshBranchContext;
    const path = require('path');

    // Build explicit file-writing instructions from feature branch contents
    // Use absolute paths so Bob knows exactly where to write
    const fileInstructions = relevantFiles.length > 0
      ? relevantFiles.map(f => {
          const absPath = path.isAbsolute(f.path) ? f.path : path.join(repoRoot, f.path);
          return `--- WRITE THIS FILE: ${absPath} ---\n${f.content}`;
        }).join('\n\n')
      : changedFiles.map(f => {
          const absPath = path.isAbsolute(f) ? f : path.join(repoRoot, f);
          return `- ${absPath}`;
        }).join('\n');

    let prompt = `You are a software engineer performing a merge. Your ONLY job is to write files to disk RIGHT NOW.

DO NOT explain what you will do.
DO NOT return JSON.
DO NOT describe your changes in prose.
USE your file-writing capability to write each file below. When done, say "Done."

CONTEXT:
The developer was working on a feature branch. That branch has been rebased onto a fresh copy of main.
You must apply the feature branch changes by writing the files below onto this clean base.

INTENT: ${intent.summary}
GOALS: ${intent.goals.join(', ')}
TECHNICAL APPROACH: ${intent.technicalApproach}

WORKING DIRECTORY: ${repoRoot}
All file paths below are absolute. Write each file to its exact path.

FILES TO WRITE — write each one exactly as shown (these are the source of truth from the feature branch):
${fileInstructions}
`;

    if (errorContext) {
      prompt += `
PREVIOUS ATTEMPT FAILED — you did not write the files. Write them now:
Root Cause: ${errorContext.rootCause}
Fix: ${errorContext.fixStrategy}
Missing files from last attempt:
${(errorContext.issues || []).map(i => `  - ${i.file || i.description}`).join('\n')}
`;
    }

    prompt += `
Write ALL files listed above to disk now. When done, say "Done."`;

    return prompt;
  }

  _buildVerificationPrompt(changes, context) {
    return `You are a senior code reviewer performing a final check before a merge is approved.

YOUR TASK: Review the files below for REAL issues only. Do not hallucinate problems. Only flag something if you can point to a specific line in the content provided.

FILES ON DISK AFTER MERGE (full contents):
${changes.map(c => `=== ${c.filePath} ===\n${c.operation !== 'delete' ? c.content : '[DELETED]'}`).join('\n\n')}

CHECK FOR:
- Syntax errors (unclosed brackets, missing semicolons in JS, etc.)
- Missing or broken imports/requires
- Functions called but not defined
- Obvious logical bugs (e.g. wrong variable names, malformed strings)

DO NOT FLAG:
- Code style preferences
- Missing tests
- Features you think should exist but don't
- Anything you cannot directly see in the file contents above

RULES:
1. Your response must contain ONLY a JSON object.
2. Do NOT write any text before { or after }
3. Do NOT use markdown fences
4. If you find no real issues, set "passed": true and "issues": []

RESPOND WITH:
{
  "passed": true,
  "issues": [{"file": "path/to/file.js", "line": 42, "severity": "error|warning", "description": "Specific issue with line reference", "suggestion": "Exact fix"}],
  "warnings": ["Minor concerns that don't block the merge"],
  "confidence": "high|medium|low"
}`;
  }

  _buildErrorAnalysisPrompt(issues, context) {
    return `You are a debugging expert. Analyze these errors and provide fix guidance.

ERRORS:
${issues.map(i => `File: ${i.file}\nLine: ${i.line || 'N/A'}\nSeverity: ${i.severity}\nIssue: ${i.description}`).join('\n---\n')}

CRITICAL: Respond with ONLY valid JSON. No markdown, no explanations, no text before or after.
Your response must start with { and end with }

{
  "rootCause": "The fundamental reason these errors occurred",
  "suggestions": ["Specific fix 1", "Specific fix 2"],
  "fixStrategy": "Overall strategy to resolve all issues"
}`;
  }

  _formatCodebaseContext(context) {
    const { relevantFiles, dependencies, structure } = context;
    let formatted = '';

    if (relevantFiles && relevantFiles.length > 0) {
      formatted += 'Relevant Files:\n';
      relevantFiles.forEach(file => {
        // Show full content for small files, truncate large ones at 3000 chars
        const preview = file.content.length > 3000
          ? file.content.substring(0, 3000) + `\n... [truncated, ${file.content.length} chars total]`
          : file.content;
        formatted += `\n--- ${file.path} ---\n${preview}\n`;
      });
    }

    if (dependencies) formatted += `\nDependencies: ${JSON.stringify(dependencies)}\n`;
    if (structure) formatted += `\nProject Structure: ${JSON.stringify(structure)}\n`;

    return formatted || 'No additional context available';
  }
}

module.exports = BobClient;

// Made with Bob
