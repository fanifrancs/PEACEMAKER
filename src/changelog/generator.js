import fs from 'fs';
import path from 'path';
import { commitChanges, stageFiles } from '../git/operations.js';
import logger from '../utils/logger.js';

const CHANGELOG_PATH = 'PEACEMAKER_CHANGELOG.md';

export async function appendToChangelog(options) {
  const {
    featureBranch,
    baseBranch,
    tier,
    classification,
    intent,
    filesModified = [],
    overlappingFiles = [],
    preservedFiles = [],
    deletedFiles = [],
    verificationPassed = true,
    backupTag,
  } = options;
  
  try {
    // Generate timestamp in WAT
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
    
    // Build entry
    const entry = _buildChangelogEntry({
      timestamp,
      featureBranch,
      baseBranch,
      tier,
      classification,
      intent,
      filesModified,
      overlappingFiles,
      preservedFiles,
      deletedFiles,
      verificationPassed,
      backupTag,
    });
    
    // Read existing changelog or create new
    let changelog = '';
    if (fs.existsSync(CHANGELOG_PATH)) {
      changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    } else {
      changelog = '# Peacemaker Changelog\n\n';
    }
    
    // Append new entry
    changelog += entry + '\n';
    
    // Write back
    fs.writeFileSync(CHANGELOG_PATH, changelog, 'utf8');
    
    // Commit the changelog
    await stageFiles([CHANGELOG_PATH]);
    await commitChanges('chore: update Peacemaker changelog');
    
    logger.info('✔ Changelog updated');
  } catch (error) {
    logger.error(`Failed to update changelog: ${error.message}`);
    throw error;
  }
}

function _buildChangelogEntry(options) {
  const {
    timestamp,
    featureBranch,
    baseBranch,
    tier,
    classification,
    intent,
    filesModified,
    overlappingFiles,
    preservedFiles,
    deletedFiles,
    verificationPassed,
    backupTag,
  } = options;
  
  const lines = [];
  
  lines.push(`## [${timestamp} WAT] ${featureBranch} → ${baseBranch}`);
  lines.push('');
  lines.push(`**Tier:** ${tier} (${classification.reason})`);
  lines.push(`**Intent:** "${intent.summary}"`);
  lines.push(`**Confidence:** ${intent.confidence}`);
  lines.push('');
  
  lines.push('**Files:**');
  
  // Categorize files
  const added = filesModified.filter(f => !overlappingFiles.includes(f) && !preservedFiles.includes(f));
  const modified = overlappingFiles;
  const preserved = preservedFiles;
  const deleted = deletedFiles;
  
  for (const file of added.slice(0, 10)) {
    lines.push(`- + ${file}`);
  }
  if (added.length > 10) {
    lines.push(`- ... and ${added.length - 10} more added`);
  }
  
  for (const file of modified.slice(0, 10)) {
    lines.push(`- ~ ${file}`);
  }
  if (modified.length > 10) {
    lines.push(`- ... and ${modified.length - 10} more modified`);
  }
  
  for (const file of preserved.slice(0, 5)) {
    lines.push(`- = ${file} (preserved from base)`);
  }
  if (preserved.length > 5) {
    lines.push(`- ... and ${preserved.length - 5} more preserved`);
  }
  
  for (const file of deleted.slice(0, 5)) {
    lines.push(`- - ${file} (deleted)`);
  }
  if (deleted.length > 5) {
    lines.push(`- ... and ${deleted.length - 5} more deleted`);
  }
  
  lines.push('');
  lines.push(`**Verification:** ${verificationPassed ? 'Passed' : 'Failed'}`);
  
  if (backupTag) {
    lines.push(`**Backup tag:** ${backupTag}`);
  }
  
  lines.push('');
  
  return lines.join('\n');
}

export function readChangelogStats() {
  try {
    if (!fs.existsSync(CHANGELOG_PATH)) {
      return {
        totalMerges: 0,
        tier1: 0,
        tier2: 0,
        tier3: 0,
        retriesNeeded: 0,
        verificationPassed: 0,
        verificationFailed: 0,
      };
    }
    
    const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const entries = content.split(/^## \[/m).slice(1); // Split by entry headers
    
    let tier1 = 0;
    let tier2 = 0;
    let tier3 = 0;
    let retriesNeeded = 0;
    let verificationPassed = 0;
    let verificationFailed = 0;
    
    for (const entry of entries) {
      if (entry.includes('**Tier:** 1')) tier1++;
      if (entry.includes('**Tier:** 2')) tier2++;
      if (entry.includes('**Tier:** 3')) tier3++;
      
      if (entry.includes('Attempts: 2') || entry.includes('Attempts: 3')) {
        retriesNeeded++;
      }
      
      if (entry.includes('**Verification:** Passed')) verificationPassed++;
      if (entry.includes('**Verification:** Failed')) verificationFailed++;
    }
    
    return {
      totalMerges: entries.length,
      tier1,
      tier2,
      tier3,
      retriesNeeded,
      verificationPassed,
      verificationFailed,
    };
  } catch (error) {
    logger.error(`Failed to read changelog stats: ${error.message}`);
    return {
      totalMerges: 0,
      tier1: 0,
      tier2: 0,
      tier3: 0,
      retriesNeeded: 0,
      verificationPassed: 0,
      verificationFailed: 0,
    };
  }
}

export function readChangelogHistory(count = 5) {
  try {
    if (!fs.existsSync(CHANGELOG_PATH)) {
      return [];
    }
    
    const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const entries = content.split(/^## \[/m).slice(1); // Split by entry headers
    
    return entries.slice(-count).reverse().map(entry => '## [' + entry.trim());
  } catch (error) {
    logger.error(`Failed to read changelog history: ${error.message}`);
    return [];
  }
}

// Made with Bob
