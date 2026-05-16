/**
 * Import Path Reconciler (Point 8.2)
 * Detects and fixes broken imports due to file moves/renames
 */

const path = require('path');
const IBMBobClient = require('./ibm-bob-client');
const logger = require('../utils/logger');

class ImportReconciler {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.bobClient = new IBMBobClient();
  }

  /**
   * Reconcile imports across all changed files
   */
  async reconcileImports(changedFiles, sourceBranch, targetBranch) {
    logger.debug('Reconciling import paths...');

    const issues = [];

    // Get target branch file structure
    const targetFiles = await this.getFileStructure(targetBranch);

    // Analyze each changed file
    for (const file of changedFiles.sourceFiles) {
      try {
        const fileIssues = await this.analyzeFileImports(
          file,
          sourceBranch,
          targetBranch,
          targetFiles,
        );
        
        if (fileIssues.length > 0) {
          issues.push({
            file,
            issues: fileIssues,
          });
        }
      } catch (error) {
        logger.debug(`Failed to analyze imports in ${file}:`, error.message);
      }
    }

    return {
      total: issues.reduce((sum, f) => sum + f.issues.length, 0),
      filesAffected: issues.length,
      issues,
      summary: this.generateSummary(issues),
    };
  }

  /**
   * Analyze imports in a single file
   */
  async analyzeFileImports(file, sourceBranch, targetBranch, targetFiles) {
    // Get file content
    const content = await this.gitOps.getFileContent(file, sourceBranch);
    if (!content) return [];

    // Extract imports
    const imports = this.extractImports(content, file);
    if (imports.length === 0) return [];

    // Check each import
    const issues = [];

    for (const imp of imports) {
      const issue = await this.checkImport(imp, file, targetFiles, targetBranch);
      if (issue) {
        issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * Extract import statements from file
   */
  extractImports(content, filePath) {
    const imports = [];
    const ext = path.extname(filePath);

    // JavaScript/TypeScript imports
    if (['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
      imports.push(...this.extractJSImports(content));
    }

    // Python imports
    if (ext === '.py') {
      imports.push(...this.extractPythonImports(content));
    }

    // Java imports
    if (ext === '.java') {
      imports.push(...this.extractJavaImports(content));
    }

    return imports;
  }

  /**
   * Extract JavaScript/TypeScript imports
   */
  extractJSImports(content) {
    const imports = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // ES6 imports: import ... from '...'
      const es6Match = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
      if (es6Match) {
        imports.push({
          type: 'es6-import',
          path: es6Match[1],
          line: index + 1,
          raw: line.trim(),
        });
      }

      // CommonJS require: require('...')
      const cjsMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (cjsMatch) {
        imports.push({
          type: 'commonjs-require',
          path: cjsMatch[1],
          line: index + 1,
          raw: line.trim(),
        });
      }

      // Dynamic imports: import('...')
      const dynamicMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (dynamicMatch) {
        imports.push({
          type: 'dynamic-import',
          path: dynamicMatch[1],
          line: index + 1,
          raw: line.trim(),
        });
      }
    });

    return imports;
  }

  /**
   * Extract Python imports
   */
  extractPythonImports(content) {
    const imports = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // from ... import ...
      const fromMatch = line.match(/from\s+([^\s]+)\s+import/);
      if (fromMatch) {
        imports.push({
          type: 'python-from',
          path: fromMatch[1].replace(/\./g, '/'),
          line: index + 1,
          raw: line.trim(),
        });
      }

      // import ...
      const importMatch = line.match(/^import\s+([^\s]+)/);
      if (importMatch) {
        imports.push({
          type: 'python-import',
          path: importMatch[1].replace(/\./g, '/'),
          line: index + 1,
          raw: line.trim(),
        });
      }
    });

    return imports;
  }

  /**
   * Extract Java imports
   */
  extractJavaImports(content) {
    const imports = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const match = line.match(/import\s+([^;]+);/);
      if (match) {
        imports.push({
          type: 'java-import',
          path: match[1].replace(/\./g, '/'),
          line: index + 1,
          raw: line.trim(),
        });
      }
    });

    return imports;
  }

  /**
   * Check if import is valid in target branch
   */
  async checkImport(imp, sourceFile, targetFiles, targetBranch) {
    // Skip external packages (node_modules, etc.)
    if (this.isExternalImport(imp.path)) {
      return null;
    }

    // Resolve import path relative to source file
    const resolvedPath = this.resolveImportPath(imp.path, sourceFile);

    // Check if file exists in target branch
    const exists = await this.fileExistsInTarget(resolvedPath, targetFiles);

    if (exists) {
      return null; // Import is valid
    }

    // File doesn't exist - try to find it
    const newLocation = await this.findMovedFile(resolvedPath, targetFiles, targetBranch);

    if (newLocation) {
      // Calculate new import path
      const newImportPath = this.calculateRelativeImport(sourceFile, newLocation);

      return {
        type: 'moved-file',
        oldPath: imp.path,
        newPath: newImportPath,
        resolvedOldPath: resolvedPath,
        resolvedNewPath: newLocation,
        line: imp.line,
        confidence: 0.95,
        suggestion: `Update import from '${imp.path}' to '${newImportPath}'`,
      };
    }

    // File not found - might be deleted or renamed significantly
    return {
      type: 'missing-file',
      oldPath: imp.path,
      resolvedPath,
      line: imp.line,
      confidence: 0.5,
      suggestion: await this.getAISuggestion(imp, sourceFile, targetFiles, targetBranch),
    };
  }

  /**
   * Check if import is external (not a local file)
   */
  isExternalImport(importPath) {
    // Relative imports start with . or ..
    if (importPath.startsWith('.')) {
      return false;
    }

    // Absolute imports from project root (might start with @, ~, or /)
    if (importPath.startsWith('@') || importPath.startsWith('~') || importPath.startsWith('/')) {
      return false;
    }

    // Everything else is external (npm packages, etc.)
    return true;
  }

  /**
   * Resolve import path to absolute path
   */
  resolveImportPath(importPath, sourceFile) {
    if (importPath.startsWith('.')) {
      // Relative import
      const sourceDir = path.dirname(sourceFile);
      return path.normalize(path.join(sourceDir, importPath));
    }

    // Absolute import (from project root)
    return importPath.replace(/^[@~\/]+/, '');
  }

  /**
   * Check if file exists in target branch
   */
  async fileExistsInTarget(filePath, targetFiles) {
    // Try with common extensions
    const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '/index.js', '/index.ts'];

    for (const ext of extensions) {
      const testPath = filePath + ext;
      if (targetFiles.has(testPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find moved file in target branch
   */
  async findMovedFile(originalPath, targetFiles, targetBranch) {
    const fileName = path.basename(originalPath);
    const fileNameWithoutExt = path.parse(fileName).name;

    // Look for files with same name
    const candidates = Array.from(targetFiles).filter((file) => {
      const candidateName = path.basename(file);
      const candidateNameWithoutExt = path.parse(candidateName).name;
      return candidateNameWithoutExt === fileNameWithoutExt;
    });

    if (candidates.length === 1) {
      return candidates[0];
    }

    if (candidates.length > 1) {
      // Multiple candidates - use heuristics
      // Prefer files in similar directory structure
      const originalDir = path.dirname(originalPath);
      const bestMatch = candidates.find((c) => path.dirname(c).includes(originalDir));
      return bestMatch || candidates[0];
    }

    return null;
  }

  /**
   * Calculate relative import path
   */
  calculateRelativeImport(fromFile, toFile) {
    const fromDir = path.dirname(fromFile);
    let relativePath = path.relative(fromDir, toFile);

    // Normalize path separators
    relativePath = relativePath.replace(/\\/g, '/');

    // Remove extension for imports
    relativePath = relativePath.replace(/\.(js|jsx|ts|tsx|json)$/, '');

    // Add ./ prefix if needed
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    return relativePath;
  }

  /**
   * Get AI suggestion for missing import
   */
  async getAISuggestion(imp, sourceFile, targetFiles, targetBranch) {
    try {
      const result = await this.bobClient.suggestImportFix(
        sourceFile,
        [imp],
        Object.fromEntries(Array.from(targetFiles).map((f) => [f, true])),
      );

      if (result.fixes && result.fixes.length > 0) {
        return result.fixes[0].newPath || 'File may have been deleted';
      }
    } catch (error) {
      logger.debug('AI suggestion failed:', error.message);
    }

    return 'File may have been deleted or significantly renamed';
  }

  /**
   * Get file structure from branch
   */
  async getFileStructure(branch) {
    try {
      // Get list of all files in branch
      const result = await this.gitOps.git.raw(['ls-tree', '-r', '--name-only', branch]);
      const files = result.trim().split('\n').filter(Boolean);
      return new Set(files);
    } catch (error) {
      logger.debug('Failed to get file structure:', error.message);
      return new Set();
    }
  }

  /**
   * Generate summary of import issues
   */
  generateSummary(issues) {
    const movedFiles = issues.reduce(
      (sum, f) => sum + f.issues.filter((i) => i.type === 'moved-file').length,
      0,
    );

    const missingFiles = issues.reduce(
      (sum, f) => sum + f.issues.filter((i) => i.type === 'missing-file').length,
      0,
    );

    const avgConfidence = issues
      .flatMap((f) => f.issues)
      .reduce((sum, i) => sum + i.confidence, 0) / (issues.flatMap((f) => f.issues).length || 1);

    return {
      movedFiles,
      missingFiles,
      avgConfidence: Math.round(avgConfidence * 100),
      recommendedAction: movedFiles > 0 ? 'apply-path-updates' : 'manual-review',
    };
  }
}

module.exports = ImportReconciler;

// Made with Bob
