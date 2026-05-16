/**
 * Dependency Compatibility Checker (Point 8.5)
 * Version conflict detection and resolution suggestions
 */

const IBMBobClient = require('./ibm-bob-client');
const logger = require('../utils/logger');

class DependencyChecker {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.bobClient = new IBMBobClient();
  }

  /**
   * Check dependencies between branches
   */
  async checkDependencies(sourceBranch, targetBranch) {
    logger.debug('Checking dependency compatibility...');

    const issues = [];

    // Check package.json (Node.js)
    const packageIssues = await this.checkPackageJSON(sourceBranch, targetBranch);
    issues.push(...packageIssues);

    // Check requirements.txt (Python)
    const pythonIssues = await this.checkPythonDeps(sourceBranch, targetBranch);
    issues.push(...pythonIssues);

    // Check pom.xml (Java/Maven)
    const mavenIssues = await this.checkMavenDeps(sourceBranch, targetBranch);
    issues.push(...mavenIssues);

    return {
      total: issues.length,
      issues,
      summary: this.generateSummary(issues),
    };
  }

  /**
   * Check package.json dependencies
   */
  async checkPackageJSON(sourceBranch, targetBranch) {
    const issues = [];

    try {
      const sourceContent = await this.gitOps.getFileContent('package.json', sourceBranch);
      const targetContent = await this.gitOps.getFileContent('package.json', targetBranch);

      if (!sourceContent || !targetContent) return issues;

      const sourcePkg = JSON.parse(sourceContent);
      const targetPkg = JSON.parse(targetContent);

      // Check dependencies
      const depIssues = await this.compareDependencies(
        sourcePkg.dependencies || {},
        targetPkg.dependencies || {},
        'dependencies',
      );
      issues.push(...depIssues);

      // Check devDependencies
      const devDepIssues = await this.compareDependencies(
        sourcePkg.devDependencies || {},
        targetPkg.devDependencies || {},
        'devDependencies',
      );
      issues.push(...devDepIssues);
    } catch (error) {
      logger.debug('Failed to check package.json:', error.message);
    }

    return issues;
  }

  /**
   * Check Python requirements.txt
   */
  async checkPythonDeps(sourceBranch, targetBranch) {
    const issues = [];

    try {
      const sourceContent = await this.gitOps.getFileContent('requirements.txt', sourceBranch);
      const targetContent = await this.gitOps.getFileContent('requirements.txt', targetBranch);

      if (!sourceContent || !targetContent) return issues;

      const sourceDeps = this.parsePythonRequirements(sourceContent);
      const targetDeps = this.parsePythonRequirements(targetContent);

      const depIssues = await this.compareDependencies(
        sourceDeps,
        targetDeps,
        'python-packages',
      );
      issues.push(...depIssues);
    } catch (error) {
      logger.debug('Failed to check requirements.txt:', error.message);
    }

    return issues;
  }

  /**
   * Parse Python requirements.txt
   */
  parsePythonRequirements(content) {
    const deps = {};
    const lines = content.split('\n');

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      // Parse package==version or package>=version
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*([=><]+)\s*([0-9.]+)/);
      if (match) {
        deps[match[1]] = match[3];
      }
    });

    return deps;
  }

  /**
   * Check Maven pom.xml
   */
  async checkMavenDeps(sourceBranch, targetBranch) {
    const issues = [];

    try {
      const sourceContent = await this.gitOps.getFileContent('pom.xml', sourceBranch);
      const targetContent = await this.gitOps.getFileContent('pom.xml', targetBranch);

      if (!sourceContent || !targetContent) return issues;

      const sourceDeps = this.parseMavenDependencies(sourceContent);
      const targetDeps = this.parseMavenDependencies(targetContent);

      const depIssues = await this.compareDependencies(
        sourceDeps,
        targetDeps,
        'maven-dependencies',
      );
      issues.push(...depIssues);
    } catch (error) {
      logger.debug('Failed to check pom.xml:', error.message);
    }

    return issues;
  }

  /**
   * Parse Maven dependencies from pom.xml
   */
  parseMavenDependencies(content) {
    const deps = {};
    
    // Simple regex-based parsing (in production, use XML parser)
    const depRegex = /<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/dependency>/g;
    let match;

    while ((match = depRegex.exec(content)) !== null) {
      deps[match[1]] = match[2];
    }

    return deps;
  }

  /**
   * Compare dependencies between branches
   */
  async compareDependencies(sourceDeps, targetDeps, type) {
    const issues = [];

    // Check for version conflicts
    for (const [pkg, sourceVersion] of Object.entries(sourceDeps)) {
      const targetVersion = targetDeps[pkg];

      if (targetVersion && targetVersion !== sourceVersion) {
        // Version conflict detected
        const issue = await this.analyzeVersionConflict(
          pkg,
          sourceVersion,
          targetVersion,
          type,
        );
        issues.push(issue);
      }
    }

    // Check for new dependencies in feature branch
    const newInSource = Object.keys(sourceDeps).filter((pkg) => !targetDeps[pkg]);
    if (newInSource.length > 0) {
      issues.push({
        type: 'new-dependencies',
        category: type,
        packages: newInSource,
        versions: newInSource.map((pkg) => ({ pkg, version: sourceDeps[pkg] })),
        suggestion: 'Review and merge new dependencies',
        confidence: 0.9,
        riskLevel: 'low',
      });
    }

    // Check for new dependencies in target branch
    const newInTarget = Object.keys(targetDeps).filter((pkg) => !sourceDeps[pkg]);
    if (newInTarget.length > 0) {
      issues.push({
        type: 'missing-dependencies',
        category: type,
        packages: newInTarget,
        versions: newInTarget.map((pkg) => ({ pkg, version: targetDeps[pkg] })),
        suggestion: 'Add missing dependencies from target branch',
        confidence: 0.9,
        riskLevel: 'medium',
      });
    }

    return issues;
  }

  /**
   * Analyze version conflict
   */
  async analyzeVersionConflict(pkg, sourceVersion, targetVersion, type) {
    logger.debug(`Analyzing version conflict for ${pkg}: ${sourceVersion} vs ${targetVersion}`);

    // Parse versions
    const sourceVer = this.parseVersion(sourceVersion);
    const targetVer = this.parseVersion(targetVersion);

    // Determine severity
    const severity = this.determineVersionSeverity(sourceVer, targetVer);

    // Get AI suggestion
    let aiSuggestion = null;
    try {
      aiSuggestion = await this.bobClient.suggestVersionResolution(
        pkg,
        sourceVersion,
        targetVersion,
      );
    } catch (error) {
      logger.debug('Failed to get AI suggestion:', error.message);
    }

    return {
      type: 'version-conflict',
      category: type,
      package: pkg,
      sourceVersion,
      targetVersion,
      severity,
      suggestion: aiSuggestion?.recommendedVersion || this.getDefaultSuggestion(sourceVer, targetVer),
      reasoning: aiSuggestion?.reasoning || this.getDefaultReasoning(sourceVer, targetVer),
      confidence: aiSuggestion?.confidence || 0.7,
      breaking: aiSuggestion?.breaking || severity === 'major',
      riskLevel: this.getRiskLevel(severity),
    };
  }

  /**
   * Parse semantic version
   */
  parseVersion(version) {
    // Remove ^ ~ >= etc.
    const cleaned = version.replace(/^[^0-9]+/, '');
    const parts = cleaned.split('.').map((p) => parseInt(p, 10) || 0);

    return {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
      raw: version,
    };
  }

  /**
   * Determine version conflict severity
   */
  determineVersionSeverity(sourceVer, targetVer) {
    if (sourceVer.major !== targetVer.major) {
      return 'major';
    }
    if (sourceVer.minor !== targetVer.minor) {
      return 'minor';
    }
    if (sourceVer.patch !== targetVer.patch) {
      return 'patch';
    }
    return 'none';
  }

  /**
   * Get default version suggestion
   */
  getDefaultSuggestion(sourceVer, targetVer) {
    // Use higher version by default
    if (sourceVer.major > targetVer.major) {
      return sourceVer.raw;
    }
    if (targetVer.major > sourceVer.major) {
      return targetVer.raw;
    }

    if (sourceVer.minor > targetVer.minor) {
      return sourceVer.raw;
    }
    if (targetVer.minor > sourceVer.minor) {
      return targetVer.raw;
    }

    if (sourceVer.patch > targetVer.patch) {
      return sourceVer.raw;
    }
    return targetVer.raw;
  }

  /**
   * Get default reasoning
   */
  getDefaultReasoning(sourceVer, targetVer) {
    const severity = this.determineVersionSeverity(sourceVer, targetVer);

    if (severity === 'major') {
      return 'Major version difference detected. Review breaking changes carefully.';
    }
    if (severity === 'minor') {
      return 'Minor version difference. Should be backward compatible.';
    }
    if (severity === 'patch') {
      return 'Patch version difference. Safe to use higher version.';
    }
    return 'Versions are identical.';
  }

  /**
   * Get risk level from severity
   */
  getRiskLevel(severity) {
    const levels = {
      major: 'high',
      minor: 'medium',
      patch: 'low',
      none: 'none',
    };
    return levels[severity] || 'medium';
  }

  /**
   * Generate summary
   */
  generateSummary(issues) {
    const byType = issues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {});

    const byRisk = issues.reduce((acc, issue) => {
      acc[issue.riskLevel] = (acc[issue.riskLevel] || 0) + 1;
      return acc;
    }, {});

    const versionConflicts = issues.filter((i) => i.type === 'version-conflict');
    const avgConfidence = versionConflicts.length > 0
      ? versionConflicts.reduce((sum, i) => sum + i.confidence, 0) / versionConflicts.length
      : 1;

    return {
      byType,
      byRisk,
      versionConflicts: versionConflicts.length,
      avgConfidence: Math.round(avgConfidence * 100),
      recommendedAction: this.getRecommendedAction(byRisk),
    };
  }

  /**
   * Get recommended action based on risk
   */
  getRecommendedAction(byRisk) {
    if (byRisk.high > 0) {
      return 'careful-review-required';
    }
    if (byRisk.medium > 0) {
      return 'review-and-test';
    }
    if (byRisk.low > 0) {
      return 'safe-to-merge';
    }
    return 'no-conflicts';
  }
}

module.exports = DependencyChecker;

// Made with Bob
