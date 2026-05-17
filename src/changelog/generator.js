const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * Changelog Generator - Creates human-readable merge records
 * Generates and maintains PEACEMAKER_CHANGELOG.md
 */
class ChangelogGenerator {
  constructor() {
    this.changelogPath = 'PEACEMAKER_CHANGELOG.md';
  }

  /**
   * Generate and append changelog entry for a merge
   * @param {string} branch - Feature branch name
   * @param {Object} intent - Extracted intent
   * @param {Object} replayResult - Replay result
   * @param {Object} classification - Classification result
   * @returns {Promise<void>}
   */
  async generate(branch, intent, replayResult, classification) {
    logger.info('Generating post-merge changelog...');

    try {
      const entry = this._buildChangelogEntry(branch, intent, replayResult, classification);
      
      // Check if changelog exists
      let existingContent = '';
      try {
        existingContent = await fs.readFile(this.changelogPath, 'utf-8');
      } catch (error) {
        // File doesn't exist, create header
        existingContent = this._buildChangelogHeader();
      }

      // Append new entry after header
      const lines = existingContent.split('\n');
      const headerEndIndex = lines.findIndex(line => line.startsWith('---'));
      
      if (headerEndIndex !== -1) {
        lines.splice(headerEndIndex + 1, 0, '', entry);
      } else {
        lines.push('', entry);
      }

      const newContent = lines.join('\n');
      await fs.writeFile(this.changelogPath, newContent, 'utf-8');

      logger.info(`Changelog updated: ${this.changelogPath}`);

    } catch (error) {
      logger.error(`Failed to generate changelog: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build changelog header
   * @private
   */
  _buildChangelogHeader() {
    return `# Peacemaker Merge Changelog

This file tracks all merges performed by Peacemaker, including intent summaries, 
verification results, and applied changes.

---
`;
  }

  /**
   * Build a single changelog entry
   * @private
   */
  _buildChangelogEntry(branch, intent, replayResult, classification) {
    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour12: false }).replace(',', '');
    const date = timestamp.split(' ')[0];
    
    const lines = [];
    
    // Header
    lines.push(`## ${date} - ${branch} → main`);
    lines.push('');

    // Intent
    if (replayResult.extractedIntent) {
      lines.push(`**Intent:** ${replayResult.extractedIntent.summary}`);
      lines.push('');
      
      if (replayResult.extractedIntent.goals && replayResult.extractedIntent.goals.length > 0) {
        lines.push('**Goals:**');
        replayResult.extractedIntent.goals.forEach(goal => {
          lines.push(`- ${goal}`);
        });
        lines.push('');
      }
    }

    // Classification
    lines.push(`**Tier:** ${classification.tier} (${classification.reasoning.summary})`);
    lines.push('');

    // Divergence
    lines.push('**Divergence:**');
    lines.push(`- ${classification.metrics.commitsBehind} commits behind main`);
    lines.push(`- ${classification.metrics.commitsAhead} commits ahead of main`);
    lines.push(`- ${classification.metrics.changedFilesCount} files modified`);
    if (classification.metrics.conflictingFilesCount > 0) {
      lines.push(`- ${classification.metrics.conflictingFilesCount} potential conflicts`);
    }
    lines.push('');

    // Files Modified
    if (replayResult.appliedChanges && replayResult.appliedChanges.length > 0) {
      lines.push('**Files Modified:**');
      
      const maxFiles = 20;
      const filesToShow = replayResult.appliedChanges.slice(0, maxFiles);
      
      filesToShow.forEach(change => {
        const prefix = change.operation === 'create' ? '+ ' :
                      change.operation === 'delete' ? '- ' :
                      change.operation === 'preserve' ? '= ' :
                      '~ ';
        lines.push(`${prefix}${change.filePath}`);
      });

      if (replayResult.appliedChanges.length > maxFiles) {
        lines.push(`... and ${replayResult.appliedChanges.length - maxFiles} more files`);
      }
      lines.push('');
    }

    // Verification
    const verificationStatus = replayResult.verification?.passed ? 'Passed' : 'Had Issues';
    const retryNote = replayResult.retryNeeded ? ' (1 retry needed)' : '';
    lines.push(`**Verification:** ${verificationStatus}${retryNote}`);
    
    if (replayResult.retryNeeded && replayResult.errorContext) {
      lines.push(`- Self-check detected: ${replayResult.errorContext.rootCause}`);
      lines.push(`- Auto-corrected: ${replayResult.errorContext.fixStrategy}`);
    }
    
    if (replayResult.verification?.issues && replayResult.verification.issues.length > 0) {
      lines.push(`- ${replayResult.verification.issues.length} issue(s) flagged`);
    }
    lines.push('');

    // Metadata
    lines.push(`**Merged by:** ${process.env.USER || 'admin'}@${require('os').hostname()}`);
    lines.push(`**Timestamp:** ${timestamp}`);
    lines.push('');
    lines.push('---');

    return lines.join('\n');
  }

  /**
   * Get recent changelog entries
   * @param {number} count - Number of entries to retrieve
   * @returns {Promise<Array>} Array of changelog entries
   */
  async getRecentEntries(count = 5) {
    try {
      const content = await fs.readFile(this.changelogPath, 'utf-8');
      const entries = content.split('---').filter(e => e.trim() && !e.includes('Peacemaker Merge Changelog'));
      return entries.slice(0, count).map(e => e.trim());
    } catch (error) {
      logger.debug('No changelog found or could not read it');
      return [];
    }
  }

  /**
   * Generate a summary report of all merges
   * @returns {Promise<Object>} Summary statistics
   */
  async generateSummary() {
    try {
      const content = await fs.readFile(this.changelogPath, 'utf-8');
      
      const entries = content.split('---').filter(e => e.trim() && !e.includes('Peacemaker Merge Changelog'));
      
      const summary = {
        totalMerges: entries.length,
        tier1: 0,
        tier2: 0,
        tier3: 0,
        retriesNeeded: 0,
        verificationPassed: 0,
        verificationFailed: 0
      };

      entries.forEach(entry => {
        if (entry.includes('Tier:** 1') || entry.includes('Tier: 1')) summary.tier1++;
        if (entry.includes('Tier:** 2') || entry.includes('Tier: 2')) summary.tier2++;
        if (entry.includes('Tier:** 3') || entry.includes('Tier: 3')) summary.tier3++;
        if (entry.includes('retry needed') || entry.includes('(1 retry needed)')) summary.retriesNeeded++;
        if (entry.includes('Verification: Passed') || entry.includes('Verification:** Passed')) summary.verificationPassed++;
        if (entry.includes('Verification: Had Issues') || entry.includes('Verification:** Had Issues')) summary.verificationFailed++;
      });

      return summary;

    } catch (error) {
      logger.debug('Could not generate summary');
      return null;
    }
  }

  /**
   * Build a human-readable summary for display
   * @param {Object} summary - Summary statistics
   * @returns {string} Formatted summary
   */
  formatSummary(summary) {
    if (!summary) return 'No merge history available';

    const lines = [];
    lines.push('Peacemaker Merge Statistics:');
    lines.push(`  Total Merges: ${summary.totalMerges}`);
    lines.push(`  Tier 1 (Minor): ${summary.tier1}`);
    lines.push(`  Tier 2 (Moderate): ${summary.tier2}`);
    lines.push(`  Tier 3 (Critical): ${summary.tier3}`);
    lines.push(`  Retries Needed: ${summary.retriesNeeded}`);
    lines.push(`  Verification Passed: ${summary.verificationPassed}`);
    lines.push(`  Verification Failed: ${summary.verificationFailed}`);

    return lines.join('\n');
  }
}

module.exports = ChangelogGenerator;

// Made with Bob