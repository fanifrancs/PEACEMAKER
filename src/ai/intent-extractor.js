/**
 * Intent Extractor
 * Extracts developer intent from branch context
 */

const IBMBobClient = require('./ibm-bob-client');
const logger = require('../utils/logger');

class IntentExtractor {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.bobClient = new IBMBobClient();
    this.cache = new Map(); // Cache intents by branch+commit hash
  }

  /**
   * Extract intent from branch
   */
  async extractIntent(sourceBranch, targetBranch) {
    try {
      // Generate cache key
      const cacheKey = await this.generateCacheKey(sourceBranch);
      
      // Check cache
      if (this.cache.has(cacheKey)) {
        logger.debug('Using cached intent');
        return this.cache.get(cacheKey);
      }

      logger.debug('Extracting developer intent...');

      // Get branch context
      const context = await this.gatherBranchContext(sourceBranch, targetBranch);

      // Extract intent using IBM Bob
      const intent = await this.bobClient.extractIntent(
        sourceBranch,
        context.commits,
        context.changedFiles,
      );

      // Enhance with additional analysis
      const enhancedIntent = this.enhanceIntent(intent, context);

      // Cache the result
      this.cache.set(cacheKey, enhancedIntent);

      return enhancedIntent;
    } catch (error) {
      logger.error('Failed to extract intent:', error.message);
      
      // Return fallback intent
      return this.getFallbackIntent(sourceBranch);
    }
  }

  /**
   * Generate cache key for intent
   */
  async generateCacheKey(branch) {
    try {
      // Get latest commit hash
      const commits = await this.gitOps.getCommitHistory(branch, 1);
      if (commits.length > 0) {
        return `${branch}:${commits[0].hash}`;
      }
    } catch (error) {
      logger.debug('Failed to generate cache key:', error.message);
    }
    
    return branch;
  }

  /**
   * Gather branch context for intent extraction
   */
  async gatherBranchContext(sourceBranch, targetBranch) {
    // Get commit history
    const commits = await this.gitOps.getCommitHistory(sourceBranch, 10);

    // Get changed files
    const changedFiles = await this.gitOps.getChangedFiles(sourceBranch, targetBranch);

    // Analyze file types
    const fileTypes = this.analyzeFileTypes(changedFiles.sourceFiles);

    // Get divergence
    const divergence = await this.gitOps.calculateDivergence(sourceBranch, targetBranch);

    return {
      commits,
      changedFiles: changedFiles.sourceFiles,
      fileTypes,
      divergence,
    };
  }

  /**
   * Analyze file types in changes
   */
  analyzeFileTypes(files) {
    const types = {
      code: [],
      config: [],
      docs: [],
      tests: [],
      styles: [],
      other: [],
    };

    const patterns = {
      code: /\.(js|jsx|ts|tsx|py|java|go|rs|cpp|c|h)$/,
      config: /\.(json|yaml|yml|toml|ini|env|config)$/,
      docs: /\.(md|txt|rst|adoc)$/,
      tests: /\.(test|spec)\.(js|jsx|ts|tsx|py)$/,
      styles: /\.(css|scss|sass|less|styl)$/,
    };

    files.forEach((file) => {
      let categorized = false;
      
      for (const [type, pattern] of Object.entries(patterns)) {
        if (pattern.test(file)) {
          types[type].push(file);
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        types.other.push(file);
      }
    });

    return types;
  }

  /**
   * Enhance intent with additional analysis
   */
  enhanceIntent(intent, context) {
    // Determine primary change type
    const changeType = this.determineChangeType(context.fileTypes);

    // Identify affected areas
    const affectedAreas = this.identifyAffectedAreas(context.changedFiles);

    // Calculate scope
    const scope = this.calculateScope(context);

    return {
      ...intent,
      changeType,
      affectedAreas,
      scope,
      fileTypes: context.fileTypes,
      commitCount: context.commits.length,
      divergence: context.divergence,
    };
  }

  /**
   * Determine primary change type
   */
  determineChangeType(fileTypes) {
    const counts = {
      feature: fileTypes.code.length,
      config: fileTypes.config.length,
      documentation: fileTypes.docs.length,
      testing: fileTypes.tests.length,
      styling: fileTypes.styles.length,
    };

    // Find dominant type
    const dominant = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)[0];

    return dominant ? dominant[0] : 'mixed';
  }

  /**
   * Identify affected areas of codebase
   */
  identifyAffectedAreas(files) {
    const areas = new Set();

    files.forEach((file) => {
      // Extract top-level directory
      const parts = file.split('/');
      if (parts.length > 1) {
        areas.add(parts[0]);
      }
    });

    return Array.from(areas);
  }

  /**
   * Calculate scope of changes
   */
  calculateScope(context) {
    const fileCount = context.changedFiles.length;
    const commitCount = context.commits.length;

    if (fileCount <= 3 && commitCount <= 3) {
      return 'small';
    }
    if (fileCount <= 10 && commitCount <= 10) {
      return 'medium';
    }
    return 'large';
  }

  /**
   * Get fallback intent when AI fails
   */
  getFallbackIntent(branchName) {
    // Parse branch name for hints
    const intent = this.parseIntentFromBranchName(branchName);

    return {
      intent,
      summary: `Changes in ${branchName}`,
      confidence: 0.3,
      changeType: 'unknown',
      affectedAreas: [],
      scope: 'unknown',
      fileTypes: {},
      commitCount: 0,
      divergence: {},
      fallback: true,
    };
  }

  /**
   * Parse intent from branch name
   */
  parseIntentFromBranchName(branchName) {
    // Common patterns
    const patterns = {
      feature: /^(feature|feat)\//i,
      bugfix: /^(bugfix|fix|hotfix)\//i,
      refactor: /^refactor\//i,
      docs: /^docs?\//i,
      test: /^test\//i,
      chore: /^chore\//i,
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(branchName)) {
        const name = branchName.replace(pattern, '').replace(/[-_]/g, ' ');
        return `${type}: ${name}`;
      }
    }

    return `Work on ${branchName.replace(/[-_]/g, ' ')}`;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize() {
    return this.cache.size;
  }
}

module.exports = IntentExtractor;

// Made with Bob
