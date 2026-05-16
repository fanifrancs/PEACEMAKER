/**
 * AI Guidance Orchestrator
 * Coordinates all AI-powered guidance components (Point 8)
 */

const IntentExtractor = require('./intent-extractor');
const ConflictResolver = require('./conflict-resolver');
const ImportReconciler = require('./import-reconciler');
const SyntaxValidator = require('./syntax-validator');
const StructuralAdvisor = require('./structural-advisor');
const DependencyChecker = require('./dependency-checker');
const logger = require('../utils/logger');

class GuidanceOrchestrator {
  constructor(gitOps) {
    this.gitOps = gitOps;
    
    // Initialize all AI components
    this.intentExtractor = new IntentExtractor(gitOps);
    this.conflictResolver = new ConflictResolver(gitOps);
    this.importReconciler = new ImportReconciler(gitOps);
    this.syntaxValidator = new SyntaxValidator(gitOps);
    this.structuralAdvisor = new StructuralAdvisor(gitOps);
    this.dependencyChecker = new DependencyChecker(gitOps);
  }

  /**
   * Generate complete AI guidance for merge
   */
  async generateGuidance(analysis, options = {}) {
    logger.debug('Generating AI-powered merge guidance...');

    const { sourceBranch, targetBranch, conflictAnalysis, changedFiles } = analysis;

    const guidance = {
      timestamp: new Date().toISOString(),
      sourceBranch,
      targetBranch,
      components: {},
    };

    try {
      // Step 1: Extract developer intent
      guidance.intent = await this.extractIntent(sourceBranch, targetBranch);

      // Step 2: Resolve conflicts (Point 8.1)
      if (conflictAnalysis.hasConflicts) {
        guidance.components.conflicts = await this.resolveConflicts(
          conflictAnalysis.conflicts,
          sourceBranch,
          targetBranch,
          guidance.intent,
        );
      }

      // Step 3: Reconcile imports (Point 8.2)
      guidance.components.imports = await this.reconcileImports(
        changedFiles,
        sourceBranch,
        targetBranch,
      );

      // Step 4: Validate syntax (Point 8.3)
      if (options.validateSyntax !== false) {
        guidance.components.syntax = await this.validateSyntax(
          changedFiles.sourceFiles,
          sourceBranch,
          options.validationLevel || 'basic',
        );
      }

      // Step 5: Analyze structural changes (Point 8.4)
      guidance.components.structural = await this.analyzeStructural(
        sourceBranch,
        targetBranch,
        changedFiles,
      );

      // Step 6: Check dependencies (Point 8.5)
      guidance.components.dependencies = await this.checkDependencies(
        sourceBranch,
        targetBranch,
      );

      // Generate overall summary
      guidance.summary = this.generateOverallSummary(guidance);

      // Calculate overall confidence
      guidance.overallConfidence = this.calculateOverallConfidence(guidance);

      // Determine recommended action
      guidance.recommendedAction = this.determineRecommendedAction(guidance);

      return guidance;
    } catch (error) {
      logger.error('Failed to generate AI guidance:', error.message);
      throw error;
    }
  }

  /**
   * Extract developer intent
   */
  async extractIntent(sourceBranch, targetBranch) {
    try {
      return await this.intentExtractor.extractIntent(sourceBranch, targetBranch);
    } catch (error) {
      logger.warn('Intent extraction failed:', error.message);
      return {
        intent: 'Unknown',
        summary: 'Failed to extract intent',
        confidence: 0,
        fallback: true,
      };
    }
  }

  /**
   * Resolve conflicts with AI (Point 8.1)
   */
  async resolveConflicts(conflicts, sourceBranch, targetBranch, intent) {
    try {
      const result = await this.conflictResolver.resolveConflicts(
        conflicts,
        sourceBranch,
        targetBranch,
        intent,
      );

      return {
        ...result,
        summary: this.conflictResolver.generateSummary(result),
      };
    } catch (error) {
      logger.warn('Conflict resolution failed:', error.message);
      return {
        total: conflicts.length,
        resolved: 0,
        failed: conflicts.length,
        resolutions: [],
        error: error.message,
      };
    }
  }

  /**
   * Reconcile import paths (Point 8.2)
   */
  async reconcileImports(changedFiles, sourceBranch, targetBranch) {
    try {
      return await this.importReconciler.reconcileImports(
        changedFiles,
        sourceBranch,
        targetBranch,
      );
    } catch (error) {
      logger.warn('Import reconciliation failed:', error.message);
      return {
        total: 0,
        filesAffected: 0,
        issues: [],
        error: error.message,
      };
    }
  }

  /**
   * Validate syntax (Point 8.3)
   */
  async validateSyntax(files, branch, level) {
    try {
      return await this.syntaxValidator.validateFiles(files, branch, level);
    } catch (error) {
      logger.warn('Syntax validation failed:', error.message);
      return {
        total: files.length,
        valid: 0,
        invalid: 0,
        warnings: 0,
        results: [],
        error: error.message,
      };
    }
  }

  /**
   * Analyze structural changes (Point 8.4)
   */
  async analyzeStructural(sourceBranch, targetBranch, changedFiles) {
    try {
      return await this.structuralAdvisor.analyzeStructuralChanges(
        sourceBranch,
        targetBranch,
        changedFiles,
      );
    } catch (error) {
      logger.warn('Structural analysis failed:', error.message);
      return {
        total: 0,
        changes: [],
        error: error.message,
      };
    }
  }

  /**
   * Check dependencies (Point 8.5)
   */
  async checkDependencies(sourceBranch, targetBranch) {
    try {
      return await this.dependencyChecker.checkDependencies(sourceBranch, targetBranch);
    } catch (error) {
      logger.warn('Dependency check failed:', error.message);
      return {
        total: 0,
        issues: [],
        error: error.message,
      };
    }
  }

  /**
   * Generate overall summary
   */
  generateOverallSummary(guidance) {
    const summary = {
      intent: guidance.intent?.intent || 'Unknown',
      intentConfidence: guidance.intent?.confidence || 0,
      totalIssues: 0,
      issuesByComponent: {},
      criticalIssues: [],
    };

    // Count issues from each component
    if (guidance.components.conflicts) {
      const conflicts = guidance.components.conflicts;
      summary.issuesByComponent.conflicts = conflicts.total;
      summary.totalIssues += conflicts.total;
      
      if (conflicts.failed > 0) {
        summary.criticalIssues.push(`${conflicts.failed} conflicts could not be auto-resolved`);
      }
    }

    if (guidance.components.imports) {
      const imports = guidance.components.imports;
      summary.issuesByComponent.imports = imports.total;
      summary.totalIssues += imports.total;
      
      if (imports.total > 0) {
        summary.criticalIssues.push(`${imports.total} import path issues detected`);
      }
    }

    if (guidance.components.syntax) {
      const syntax = guidance.components.syntax;
      summary.issuesByComponent.syntax = syntax.invalid;
      summary.totalIssues += syntax.invalid;
      
      if (syntax.invalid > 0) {
        summary.criticalIssues.push(`${syntax.invalid} files with syntax errors`);
      }
    }

    if (guidance.components.structural) {
      const structural = guidance.components.structural;
      summary.issuesByComponent.structural = structural.total;
      summary.totalIssues += structural.total;
      
      if (structural.total > 0) {
        summary.criticalIssues.push(`${structural.total} structural changes detected`);
      }
    }

    if (guidance.components.dependencies) {
      const deps = guidance.components.dependencies;
      summary.issuesByComponent.dependencies = deps.total;
      summary.totalIssues += deps.total;
      
      const versionConflicts = deps.issues?.filter((i) => i.type === 'version-conflict').length || 0;
      if (versionConflicts > 0) {
        summary.criticalIssues.push(`${versionConflicts} dependency version conflicts`);
      }
    }

    return summary;
  }

  /**
   * Calculate overall confidence score
   */
  calculateOverallConfidence(guidance) {
    const confidences = [];

    // Intent confidence
    if (guidance.intent?.confidence) {
      confidences.push(guidance.intent.confidence);
    }

    // Conflict resolution confidence
    if (guidance.components.conflicts?.summary?.avgConfidence) {
      confidences.push(guidance.components.conflicts.summary.avgConfidence / 100);
    }

    // Import reconciliation confidence
    if (guidance.components.imports?.summary?.avgConfidence) {
      confidences.push(guidance.components.imports.summary.avgConfidence / 100);
    }

    // Dependency check confidence
    if (guidance.components.dependencies?.summary?.avgConfidence) {
      confidences.push(guidance.components.dependencies.summary.avgConfidence / 100);
    }

    // Calculate weighted average
    if (confidences.length === 0) return 0.5;

    const avg = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    return Math.round(avg * 100);
  }

  /**
   * Determine recommended action
   */
  determineRecommendedAction(guidance) {
    const { summary, overallConfidence } = guidance;

    // Critical issues that block merge
    if (guidance.components.syntax?.invalid > 0) {
      return {
        action: 'fix-syntax-errors',
        priority: 'critical',
        description: 'Fix syntax errors before proceeding',
      };
    }

    // High confidence, few issues
    if (overallConfidence >= 80 && summary.totalIssues <= 5) {
      return {
        action: 'apply-with-review',
        priority: 'low',
        description: 'Apply AI suggestions with quick review',
      };
    }

    // Medium confidence or moderate issues
    if (overallConfidence >= 60 && summary.totalIssues <= 15) {
      return {
        action: 'careful-review',
        priority: 'medium',
        description: 'Review AI suggestions carefully before applying',
      };
    }

    // Low confidence or many issues
    if (overallConfidence < 60 || summary.totalIssues > 15) {
      return {
        action: 'manual-intervention',
        priority: 'high',
        description: 'Manual review and resolution recommended',
      };
    }

    // Default
    return {
      action: 'review-and-apply',
      priority: 'medium',
      description: 'Review suggestions and apply selectively',
    };
  }

  /**
   * Format guidance for display
   */
  formatForDisplay(guidance) {
    return {
      summary: {
        intent: guidance.intent?.intent || 'Unknown',
        totalIssues: guidance.summary.totalIssues,
        confidence: `${guidance.overallConfidence}%`,
        action: guidance.recommendedAction.action,
      },
      components: {
        conflicts: this.formatConflicts(guidance.components.conflicts),
        imports: this.formatImports(guidance.components.imports),
        syntax: this.formatSyntax(guidance.components.syntax),
        structural: this.formatStructural(guidance.components.structural),
        dependencies: this.formatDependencies(guidance.components.dependencies),
      },
    };
  }

  /**
   * Format conflict guidance
   */
  formatConflicts(conflicts) {
    if (!conflicts || conflicts.total === 0) {
      return { status: 'none', message: 'No conflicts detected' };
    }

    return {
      status: conflicts.resolved === conflicts.total ? 'resolved' : 'partial',
      total: conflicts.total,
      resolved: conflicts.resolved,
      failed: conflicts.failed,
      avgConfidence: conflicts.summary?.avgConfidence || 0,
    };
  }

  /**
   * Format import guidance
   */
  formatImports(imports) {
    if (!imports || imports.total === 0) {
      return { status: 'ok', message: 'No import issues' };
    }

    return {
      status: 'issues-found',
      total: imports.total,
      filesAffected: imports.filesAffected,
      movedFiles: imports.summary?.movedFiles || 0,
      missingFiles: imports.summary?.missingFiles || 0,
    };
  }

  /**
   * Format syntax guidance
   */
  formatSyntax(syntax) {
    if (!syntax || syntax.invalid === 0) {
      return { status: 'valid', message: 'All files valid' };
    }

    return {
      status: 'errors-found',
      total: syntax.total,
      valid: syntax.valid,
      invalid: syntax.invalid,
      warnings: syntax.warnings,
    };
  }

  /**
   * Format structural guidance
   */
  formatStructural(structural) {
    if (!structural || structural.total === 0) {
      return { status: 'none', message: 'No structural changes' };
    }

    return {
      status: 'changes-detected',
      total: structural.total,
      needsUpdate: structural.summary?.needsUpdate || 0,
    };
  }

  /**
   * Format dependency guidance
   */
  formatDependencies(dependencies) {
    if (!dependencies || dependencies.total === 0) {
      return { status: 'ok', message: 'No dependency conflicts' };
    }

    return {
      status: 'conflicts-found',
      total: dependencies.total,
      versionConflicts: dependencies.summary?.versionConflicts || 0,
      riskLevel: dependencies.summary?.byRisk || {},
    };
  }
}

module.exports = GuidanceOrchestrator;

// Made with Bob
