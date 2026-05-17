import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getCommitHistory, getFileContent, findForkPoint } from '../git/operations.js';
import { extractIntentFromBob } from '../bob/client.js';
import logger from '../utils/logger.js';

const INTENT_CACHE_PATH = path.join(process.env.HOME, '.peacemaker-intent-cache.json');
const MAX_CACHE_ENTRIES = 50;

function loadIntentCache() {
  try {
    if (fs.existsSync(INTENT_CACHE_PATH)) {
      const data = fs.readFileSync(INTENT_CACHE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn(`Failed to load intent cache: ${error.message}`);
  }
  return {};
}

function saveIntentCache(cache) {
  try {
    // Trim to max entries (keep most recent)
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_ENTRIES) {
      const sorted = entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
      cache = Object.fromEntries(sorted.slice(0, MAX_CACHE_ENTRIES));
    }
    
    fs.writeFileSync(INTENT_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    logger.warn(`Failed to save intent cache: ${error.message}`);
  }
}

export async function extractIntent(featureBranch, baseBranch, userDescription) {
  try {
    // Get head commit hash for cache key
    const headCommit = execSync(`git rev-parse ${featureBranch}`, { encoding: 'utf8' }).trim();
    const cacheKey = `${featureBranch}:${headCommit}`;
    
    // Check cache
    const cache = loadIntentCache();
    if (cache[cacheKey]) {
      logger.info('✓ Intent extracted (cache hit — Bob skipped)');
      return cache[cacheKey].rawContext;
    }
    
    // Get fork point
    const forkPoint = await findForkPoint(featureBranch, baseBranch);
    
    // Get commit history
    const commits = await getCommitHistory(featureBranch, baseBranch, 50);
    
    // Get changed files with status
    const nameStatusOutput = execSync(
      forkPoint 
        ? `git diff --name-status ${forkPoint}..${featureBranch}`
        : `git diff --name-status ${baseBranch}..${featureBranch}`,
      { encoding: 'utf8' }
    );
    
    const numstatOutput = execSync(
      forkPoint
        ? `git diff --numstat ${forkPoint}..${featureBranch}`
        : `git diff --numstat ${baseBranch}..${featureBranch}`,
      { encoding: 'utf8' }
    );
    
    // Parse file changes
    const changedFiles = [];
    const deletedFiles = [];
    const renamedFiles = {};
    const binaryFiles = [];
    
    // Parse name-status
    const nameStatusLines = nameStatusOutput.trim().split('\n').filter(l => l);
    for (const line of nameStatusLines) {
      const parts = line.split('\t');
      const status = parts[0];
      
      if (status === 'D') {
        deletedFiles.push(parts[1]);
      } else if (status.startsWith('R')) {
        // Renamed: R100  old-path  new-path
        renamedFiles[parts[1]] = parts[2];
        changedFiles.push(parts[2]);
      } else {
        // A (added) or M (modified)
        changedFiles.push(parts[1]);
      }
    }
    
    // Parse numstat for binary files
    const numstatLines = numstatOutput.trim().split('\n').filter(l => l);
    for (const line of numstatLines) {
      const parts = line.split('\t');
      if (parts[0] === '-' && parts[1] === '-') {
        // Binary file
        binaryFiles.push(parts[2]);
      }
    }
    
    // Read content of all non-binary changed files
    const fileContents = {};
    for (const file of changedFiles) {
      if (!binaryFiles.includes(file) && !deletedFiles.includes(file)) {
        try {
          const content = await getFileContent(featureBranch, file);
          if (content !== null) {
            fileContents[file] = content;
          }
        } catch (error) {
          logger.warn(`Could not read ${file}: ${error.message}`);
        }
      }
    }
    
    // Build file content snippets for Bob (first 80 chars of each file)
    const fileContentSnippets = Object.entries(fileContents)
      .map(([filePath, content]) => {
        const preview = content.substring(0, 80).replace(/\n/g, ' ');
        return `${filePath}: ${preview}${content.length > 80 ? '...' : ''}`;
      })
      .join('\n');
    
    // Call Bob to extract intent
    const bobPrompt = `You are analyzing a Git feature branch to understand what the developer was building.

Branch: ${featureBranch}
Base: ${baseBranch}
Developer description: ${userDescription || 'Not provided — infer from commits'}

Recent commits:
${commits.map(c => `  ${c.hash} ${c.message}`).join('\n')}

Changed files:
${changedFiles.join('\n')}

File contents:
${fileContentSnippets}

Return ONLY valid JSON (no markdown, no explanation):
{
  "summary": "one sentence describing what this branch was building",
  "goals": ["goal 1", "goal 2"],
  "technicalApproach": "brief description of technical approach",
  "confidence": "high" | "medium" | "low"
}`;

    let intentResponse = await extractIntentFromBob(bobPrompt);
    
    // Strip markdown fences if present
    intentResponse = intentResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let intent;
    try {
      intent = JSON.parse(intentResponse);
    } catch (parseError) {
      logger.warn('Failed to parse Bob intent response, retrying once...');
      
      // Retry once
      try {
        intentResponse = await extractIntentFromBob(bobPrompt);
        intentResponse = intentResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        intent = JSON.parse(intentResponse);
      } catch (retryError) {
        logger.error('Failed to parse intent after retry, using fallback');
        intent = {
          summary: commits[0]?.message || 'Unknown intent',
          goals: ['Inferred from commits'],
          technicalApproach: 'Unable to determine',
          confidence: 'low',
        };
      }
    }
    
    // Build raw context
    const rawContext = {
      featureBranch,
      baseBranch,
      forkPoint,
      commits,
      changedFiles,
      deletedFiles,
      renamedFiles,
      binaryFiles,
      fileContents,
      intent,
      userDescription,
      _preservedFiles: [],
      _binaryFiles: binaryFiles,
    };
    
    // Save to cache
    cache[cacheKey] = {
      rawContext,
      timestamp: Date.now(),
    };
    saveIntentCache(cache);
    
    logger.info('✓ Intent extracted');
    
    return rawContext;
  } catch (error) {
    logger.error(`Failed to extract intent: ${error.message}`);
    throw error;
  }
}

// Made with Bob
