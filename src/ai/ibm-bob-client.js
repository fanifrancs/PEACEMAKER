/**
 * IBM Bob API Client
 * Handles communication with IBM Bob AI service
 */

const axios = require('axios');
const config = require('../utils/config');
const logger = require('../utils/logger');

class IBMBobClient {
  constructor() {
    this.apiKey = config.ibmBob.apiKey;
    this.apiUrl = config.ibmBob.apiUrl;
    this.timeout = config.ibmBob.timeout;
    this.maxRetries = config.ibmBob.maxRetries;
    
    // Initialize axios instance
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });
  }

  /**
   * Make API request with retry logic
   */
  async makeRequest(endpoint, data, retries = 0) {
    try {
      logger.debug(`Making request to ${endpoint} (attempt ${retries + 1}/${this.maxRetries + 1})`);
      
      const response = await this.client.post(endpoint, data);
      return response.data;
    } catch (error) {
      // Check if we should retry
      if (retries < this.maxRetries && this.isRetryableError(error)) {
        logger.warn(`Request failed, retrying... (${retries + 1}/${this.maxRetries})`);
        
        // Exponential backoff
        const delay = Math.min(1000 * (2 ** retries), 10000);
        await this.sleep(delay);
        
        return this.makeRequest(endpoint, data, retries + 1);
      }
      
      // Max retries reached or non-retryable error
      logger.error('IBM Bob API request failed:', error.message);
      throw new Error(`IBM Bob API error: ${error.message}`);
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    if (!error.response) {
      // Network error, timeout, etc.
      return true;
    }
    
    const status = error.response.status;
    // Retry on 5xx errors and 429 (rate limit)
    return status >= 500 || status === 429;
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract developer intent from branch
   */
  async extractIntent(branchName, commits, changedFiles) {
    logger.debug('Extracting developer intent...');
    
    const prompt = this.buildIntentPrompt(branchName, commits, changedFiles);
    
    const response = await this.makeRequest('/analyze/intent', {
      prompt,
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more focused responses
    });
    
    return {
      intent: response.intent || 'Unknown intent',
      summary: response.summary || '',
      confidence: response.confidence || 0.5,
    };
  }

  /**
   * Build prompt for intent extraction
   */
  buildIntentPrompt(branchName, commits, changedFiles) {
    const commitMessages = commits.map((c) => `- ${c.message}`).join('\n');
    const files = changedFiles.slice(0, 20).join('\n');
    
    return `Analyze this Git branch and determine the developer's intent:

Branch Name: ${branchName}

Recent Commits:
${commitMessages}

Changed Files:
${files}

Based on the branch name, commit messages, and changed files, provide:
1. A clear statement of what the developer was trying to accomplish
2. A brief summary of the changes
3. Your confidence level (0-1)

Format your response as JSON with keys: intent, summary, confidence`;
  }

  /**
   * Resolve merge conflict using AI
   */
  async resolveConflict(context) {
    logger.debug(`Resolving conflict in ${context.file}...`);
    
    const prompt = this.buildConflictPrompt(context);
    
    const response = await this.makeRequest('/resolve/conflict', {
      prompt,
      max_tokens: 2000,
      temperature: 0.2, // Very low temperature for precise code generation
    });
    
    return {
      suggestedCode: response.code || null,
      reasoning: response.reasoning || '',
      confidence: response.confidence || 0.5,
      approach: response.approach || 'merge-both',
    };
  }

  /**
   * Build prompt for conflict resolution
   */
  buildConflictPrompt(context) {
    return `Resolve this merge conflict intelligently:

File: ${context.file}
Conflict Type: ${context.conflictType || 'content-conflict'}

Developer Intent: ${context.developerIntent || 'Unknown'}

Base Version (common ancestor):
\`\`\`
${context.baseVersion || 'N/A'}
\`\`\`

Feature Branch Version:
\`\`\`
${context.featureVersion}
\`\`\`

Target Branch Version:
\`\`\`
${context.targetVersion}
\`\`\`

Surrounding Context (10 lines before/after):
\`\`\`
${context.surroundingCode || ''}
\`\`\`

Provide a resolution that:
1. Preserves both sets of changes when possible
2. Maintains code functionality
3. Follows the project's coding style
4. Aligns with the developer's intent

Format your response as JSON with keys: code, reasoning, confidence, approach`;
  }

  /**
   * Suggest import path fixes
   */
  async suggestImportFix(file, imports, targetBranchState) {
    logger.debug(`Analyzing imports in ${file}...`);
    
    const prompt = this.buildImportPrompt(file, imports, targetBranchState);
    
    const response = await this.makeRequest('/analyze/imports', {
      prompt,
      max_tokens: 1000,
      temperature: 0.2,
    });
    
    return {
      fixes: response.fixes || [],
      confidence: response.confidence || 0.5,
    };
  }

  /**
   * Build prompt for import analysis
   */
  buildImportPrompt(file, imports, targetBranchState) {
    const importList = imports.map((imp) => `- ${imp.path} (${imp.type})`).join('\n');
    const fileStructure = Object.keys(targetBranchState).slice(0, 50).join('\n');
    
    return `Analyze and fix broken import paths:

File: ${file}

Current Imports:
${importList}

Target Branch File Structure:
${fileStructure}

For each import that doesn't exist in the target branch:
1. Find if the file was moved/renamed
2. Suggest the correct import path
3. Provide confidence level

Format response as JSON with key 'fixes' containing array of:
{ oldPath, newPath, reason, confidence }`;
  }

  /**
   * Validate syntax and suggest fixes
   */
  async suggestSyntaxFix(file, content, errors) {
    logger.debug(`Analyzing syntax errors in ${file}...`);
    
    const prompt = this.buildSyntaxPrompt(file, content, errors);
    
    const response = await this.makeRequest('/analyze/syntax', {
      prompt,
      max_tokens: 1500,
      temperature: 0.2,
    });
    
    return {
      fixes: response.fixes || [],
      confidence: response.confidence || 0.5,
    };
  }

  /**
   * Build prompt for syntax analysis
   */
  buildSyntaxPrompt(file, content, errors) {
    const errorList = errors.map((e) => `Line ${e.line}: ${e.message}`).join('\n');
    
    return `Fix syntax errors in this code:

File: ${file}

Errors:
${errorList}

Code:
\`\`\`
${content}
\`\`\`

For each error:
1. Identify the issue
2. Suggest the fix
3. Explain why
4. Provide confidence level

Format response as JSON with key 'fixes' containing array of:
{ line, issue, fix, explanation, confidence }`;
  }

  /**
   * Analyze structural changes
   */
  async analyzeStructuralChange(change, callSites) {
    logger.debug('Analyzing structural change...');
    
    const prompt = this.buildStructuralPrompt(change, callSites);
    
    const response = await this.makeRequest('/analyze/structure', {
      prompt,
      max_tokens: 1500,
      temperature: 0.3,
    });
    
    return {
      updates: response.updates || [],
      confidence: response.confidence || 0.5,
    };
  }

  /**
   * Build prompt for structural analysis
   */
  buildStructuralPrompt(change, callSites) {
    const sites = callSites.map((site) => `${site.file}:${site.line}`).join('\n');
    
    return `Analyze this structural change and suggest updates:

Change Type: ${change.type}
Function/Class: ${change.name}
Old Signature: ${change.oldSignature}
New Signature: ${change.newSignature}

Call Sites That Need Updates:
${sites}

For each call site:
1. Determine what needs to change
2. Suggest the updated code
3. Explain the change
4. Provide confidence level

Format response as JSON with key 'updates' containing array of:
{ file, line, oldCode, newCode, explanation, confidence }`;
  }

  /**
   * Suggest version resolution for dependencies
   */
  async suggestVersionResolution(pkg, featureVersion, targetVersion) {
    logger.debug(`Analyzing version conflict for ${pkg}...`);
    
    const prompt = this.buildVersionPrompt(pkg, featureVersion, targetVersion);
    
    const response = await this.makeRequest('/analyze/versions', {
      prompt,
      max_tokens: 500,
      temperature: 0.3,
    });
    
    return {
      recommendedVersion: response.version || targetVersion,
      reasoning: response.reasoning || '',
      confidence: response.confidence || 0.5,
      breaking: response.breaking || false,
    };
  }

  /**
   * Build prompt for version analysis
   */
  buildVersionPrompt(pkg, featureVersion, targetVersion) {
    return `Resolve dependency version conflict:

Package: ${pkg}
Feature Branch Version: ${featureVersion}
Target Branch Version: ${targetVersion}

Determine:
1. Which version should be used
2. If there are breaking changes between versions
3. Reasoning for the recommendation
4. Confidence level

Format response as JSON with keys: version, reasoning, confidence, breaking`;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.client.get('/health');
      return true;
    } catch (error) {
      logger.warn('IBM Bob API health check failed:', error.message);
      return false;
    }
  }
}

module.exports = IBMBobClient;

// Made with Bob
