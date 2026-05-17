import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { generateDiagnosticSection } from '../bob/client.js';
import { formatAnalysisForTerminal } from './analyzer.js';
import logger from '../utils/logger.js';

const ANALYZE_CACHE_PATH = path.join(process.env.HOME, '.peacemakr-analyze-cache.json');
const MAX_CACHE_ENTRIES = 50;

function loadAnalyzeCache() {
  try {
    if (fs.existsSync(ANALYZE_CACHE_PATH)) {
      const data = fs.readFileSync(ANALYZE_CACHE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.warn(`Failed to load analyze cache: ${error.message}`);
  }
  return {};
}

function saveAnalyzeCache(cache) {
  try {
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_ENTRIES) {
      const sorted = entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
      cache = Object.fromEntries(sorted.slice(0, MAX_CACHE_ENTRIES));
    }
    
    fs.writeFileSync(ANALYZE_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    logger.warn(`Failed to save analyze cache: ${error.message}`);
  }
}

export async function generateReport(mergeAnalysis, rawContext, options = {}) {
  const { useCache = false } = options;
  
  try {
    let cacheKey = null;
    let cache = {};
    
    if (useCache) {
      const headCommit = execSync(`git rev-parse ${rawContext.featureBranch}`, { encoding: 'utf8' }).trim();
      cacheKey = `${rawContext.featureBranch}:${headCommit}`;
      cache = loadAnalyzeCache();
      
      if (cache[cacheKey]) {
        logger.info('✓ Analysis cache hit — using cached report sections');
        const { branchIntent, structuralDiff, fileGuide } = cache[cacheKey];
        return _buildReport(mergeAnalysis, rawContext, branchIntent, structuralDiff, fileGuide);
      }
    }
    
    // Generate report sections with 3 parallel Bob calls
    const [branchIntent, structuralDiff, fileGuide] = await _generateAIBranchAnalysis(rawContext);
    
    // Save to cache if using cache
    if (useCache && cacheKey) {
      cache[cacheKey] = {
        branchIntent,
        structuralDiff,
        fileGuide,
        timestamp: Date.now(),
      };
      saveAnalyzeCache(cache);
    }
    
    return _buildReport(mergeAnalysis, rawContext, branchIntent, structuralDiff, fileGuide);
  } catch (error) {
    logger.error(`Failed to generate diagnostic report: ${error.message}`);
    throw error;
  }
}

async function _generateAIBranchAnalysis(rawContext) {
  // Prepare file content for Bob (up to 15 files, first 80 chars each)
  const fileEntries = Object.entries(rawContext.fileContents).slice(0, 15);
  const fileSnippets = fileEntries
    .map(([filePath, content]) => {
      const preview = content.substring(0, 80).replace(/\n/g, ' ');
      return `${filePath}: ${preview}${content.length > 80 ? '...' : ''}`;
    })
    .join('\n');
  
  // Thread 1: Branch Intent
  const thread1Prompt = `You are analyzing a Git feature branch to understand what was built.

Branch: ${rawContext.featureBranch}
Base: ${rawContext.baseBranch}

Recent commits:
${rawContext.commits.slice(0, 10).map(c => `  ${c.hash} ${c.message}`).join('\n')}

Changed files (first 15):
${fileSnippets}

Answer these questions:
1. What subsystems did this branch touch?
2. What was being built or changed?
3. What components were added or modified?

Write a clear, technical summary (2-3 paragraphs).`;

  // Thread 2: Structural Differences
  const directoryStructure = rawContext.changedFiles.map(f => {
    const parts = f.split('/');
    return parts.length > 1 ? parts[0] : f;
  }).filter((v, i, a) => a.indexOf(v) === i).join(', ');
  
  const thread2Prompt = `You are analyzing structural differences between two Git branches.

Branch: ${rawContext.featureBranch}
Base: ${rawContext.baseBranch}

Directory structure touched: ${directoryStructure}

Changed files: ${rawContext.changedFiles.length}
Deleted files: ${rawContext.deletedFiles.length}
Renamed files: ${rawContext.renamedFiles ? Object.keys(rawContext.renamedFiles).length : 0}

Answer these questions:
1. What directory layout changes occurred?
2. Are there config file conflicts (package.json, tsconfig, etc.)?
3. Did entry points change?
4. What dependency changes happened?

Write a clear, technical summary (2-3 paragraphs).`;

  // Thread 3: File-by-File Guide + Strategy
  const highRiskFiles = rawContext.changedFiles
    .filter(f => 
      f.includes('config') || 
      f.includes('package') || 
      f.endsWith('.json') ||
      f.endsWith('.env') ||
      rawContext.fileContents[f]
    )
    .slice(0, 15);
  
  const thread3Prompt = `You are creating a merge resolution guide for a Git branch.

Branch: ${rawContext.featureBranch}
Base: ${rawContext.baseBranch}

High-risk files (first 15):
${highRiskFiles.join('\n')}

Provide:
1. For the top 5-8 highest-risk files:
   - What exactly conflicts
   - Git command to compare (e.g., git diff main..feature -- path/to/file)
   - Resolution approach

2. Concrete merge strategy:
   - Should this be rebased or cherry-picked?
   - Which specific files need manual attention?
   - Time breakdown by task
   - Overall effort estimate in hours

Write a detailed, actionable guide.`;

  // Fire all 3 threads in parallel
  const results = await Promise.allSettled([
    generateDiagnosticSection(thread1Prompt, 1),
    generateDiagnosticSection(thread2Prompt, 2),
    generateDiagnosticSection(thread3Prompt, 3),
  ]);
  
  const branchIntent = results[0].status === 'fulfilled' 
    ? _stripMarkdownProse(results[0].value)
    : 'Unable to generate branch intent analysis.';
  
  const structuralDiff = results[1].status === 'fulfilled'
    ? _stripMarkdownProse(results[1].value)
    : 'Unable to generate structural differences analysis.';
  
  const fileGuide = results[2].status === 'fulfilled'
    ? _stripMarkdownProse(results[2].value)
    : 'Unable to generate file-by-file resolution guide.';
  
  return [branchIntent, structuralDiff, fileGuide];
}

function _stripMarkdownProse(text) {
  // Strip markdown fences
  return text
    .replace(/```markdown\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}

function _buildReport(mergeAnalysis, rawContext, branchIntent, structuralDiff, fileGuide) {
  const timestamp = new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(',', '');
  
  const contributors = _getRecentCommitAuthors(rawContext.featureBranch);
  
  const backupTag = `peacemakr-before-${rawContext.featureBranch.replace(/\//g, '-')}-${Date.now()}`;
  
  const report = `# Peacemakr Diagnostic Report

> **Refused:** Branch divergence too high for automated resolution — manual intervention required.

**Generated:** ${timestamp} (WAT)
**Branch:** ${rawContext.featureBranch} → ${rawContext.baseBranch}
**Merge base:** ${mergeAnalysis.forkPoint || 'not found'}

---

## Branch Statistics

| Metric | Value |
|--------|-------|
| Commits Behind | ${mergeAnalysis.baseChanges ? rawContext.commits.length : 'N/A'} |
| Commits Ahead | ${rawContext.commits.length} |
| Files Added (feature) | ${mergeAnalysis.featureChanges.added.length} |
| Files Modified (feature) | ${mergeAnalysis.featureChanges.modified.length} |
| Files Renamed (feature) | ${mergeAnalysis.featureChanges.renamed.length} |

---

## Merge Analysis

${formatAnalysisForTerminal(mergeAnalysis)}

---

## What This Branch Was Building

${branchIntent}

---

## Key Structural Differences

${structuralDiff}

---

## File-by-File Resolution Guide

${fileGuide}

---

## Contributors

${contributors.join('\n')}

---

## Backup & Recovery

To return base branch to its pre-analysis state:
\`\`\`bash
git tag ${backupTag} HEAD   # already created
git checkout ${rawContext.baseBranch} && git reset --hard ${backupTag}
\`\`\`
`;

  return report;
}

function _getRecentCommitAuthors(featureBranch) {
  try {
    const output = execSync(`git log ${featureBranch} --format=%an|||%ae --max-count=50`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    
    const authorMap = new Map();
    
    for (const line of lines) {
      const [name, email] = line.split('|||');
      const key = name.toLowerCase().replace(/\s+/g, '');
      
      if (!authorMap.has(key)) {
        // Prefer display name over email
        authorMap.set(key, name || email);
      }
    }
    
    return Array.from(authorMap.values()).sort();
  } catch (error) {
    logger.warn(`Failed to get commit authors: ${error.message}`);
    return ['Unknown'];
  }
}

// Made with Bob
