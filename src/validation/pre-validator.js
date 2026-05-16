/**
 * Pre-Validation Pipeline (Point 9)
 * Lightweight validation before CI execution
 * Target: < 30 seconds for typical PR
 */

const path = require('path');
const fs = require('fs').promises;
const SyntaxValidator = require('../ai/syntax-validator');
const logger = require('../utils/logger');

class PreValidator {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.syntaxValidator = new SyntaxValidator(gitOps);
    this.timeout = 30000; // 30 seconds max
    this.cache = {
      packageJson: null,
      nodeModulesExists: null,
      resolvedPaths: new Map(),
    };
  }

  /**
   * Run pre-validation on changed files
   * @param {Array} changedFiles - List of changed files
   * @param {Object} options - Validation options
   * @returns {Object} Validation results
   */
  async validate(changedFiles, options = {}) {
    const startTime = Date.now();
    const results = {
      passed: true,
      duration: 0,
      validations: {
        syntax: { passed: true, errors: [], warnings: [] },
        imports: { passed: true, errors: [], warnings: [] },
        types: { passed: true, errors: [], warnings: [] },
        dependencies: { passed: true, errors: [], warnings: [] },
      },
      summary: {
        totalFiles: changedFiles.length,
        filesChecked: 0,
        errorsFound: 0,
        warningsFound: 0,
      },
    };

    try {
      // Filter files to validate (skip non-code files)
      const filesToValidate = this.filterValidatableFiles(changedFiles);
      results.summary.filesChecked = filesToValidate.length;

      if (filesToValidate.length === 0) {
        logger.info('No files to validate');
        results.duration = Date.now() - startTime;
        return results;
      }

      // Run validations with timeout
      const validationPromise = this.runValidations(filesToValidate, options);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Validation timeout')), this.timeout)
      );

      const validationResults = await Promise.race([validationPromise, timeoutPromise]);

      // Merge results
      Object.assign(results.validations, validationResults);

      // Calculate summary
      results.passed = this.calculateOverallStatus(results.validations);
      results.summary.errorsFound = this.countErrors(results.validations);
      results.summary.warningsFound = this.countWarnings(results.validations);

    } catch (error) {
      logger.error('Pre-validation failed:', error.message);
      results.passed = false;
      results.validations.syntax.errors.push({
        type: 'validation-error',
        message: error.message,
      });
    }

    results.duration = Date.now() - startTime;
    return results;
  }

  /**
   * Filter files that should be validated
   */
  filterValidatableFiles(files) {
    const validExtensions = [
      '.js', '.jsx', '.ts', '.tsx',
      '.py', '.java', '.json',
      '.yml', '.yaml',
    ];

    return files.filter((file) => {
      const ext = path.extname(file);
      return validExtensions.includes(ext);
    });
  }

  /**
   * Run all validations in parallel
   */
  async runValidations(files, options) {
    const level = options.validationLevel || 'basic';
    const skipValidation = options.skipValidation || false;

    const results = {
      syntax: { passed: true, errors: [], warnings: [] },
      imports: { passed: true, errors: [], warnings: [] },
      types: { passed: true, errors: [], warnings: [] },
      dependencies: { passed: true, errors: [], warnings: [] },
    };

    if (skipValidation) {
      return results;
    }

    // Run validations in parallel for performance
    const validationPromises = [];

    // 1. Syntax validation
    validationPromises.push(
      this.validateSyntax(files, level)
        .then((result) => { results.syntax = result; })
        .catch((error) => {
          results.syntax.passed = false;
          results.syntax.errors.push({
            type: 'syntax-validation-error',
            message: error.message,
          });
        })
    );

    // 2. Import resolution
    validationPromises.push(
      this.validateImports(files)
        .then((result) => { results.imports = result; })
        .catch((error) => {
          results.imports.passed = false;
          results.imports.errors.push({
            type: 'import-validation-error',
            message: error.message,
          });
        })
    );

    // 3. Type validation (TypeScript only)
    if (level === 'strict' || level === 'comprehensive') {
      validationPromises.push(
        this.validateTypes(files)
          .then((result) => { results.types = result; })
          .catch((error) => {
            results.types.passed = false;
            results.types.errors.push({
              type: 'type-validation-error',
              message: error.message,
            });
          })
      );
    }

    // 4. Dependency existence
    validationPromises.push(
      this.validateDependencies(files)
        .then((result) => { results.dependencies = result; })
        .catch((error) => {
          results.dependencies.passed = false;
          results.dependencies.errors.push({
            type: 'dependency-validation-error',
            message: error.message,
          });
        })
    );

    // Wait for all validations to complete
    await Promise.all(validationPromises);

    return results;
  }

  /**
   * Validate syntax for all files
   */
  async validateSyntax(files, level) {
    const result = { passed: true, errors: [], warnings: [] };

    for (const file of files) {
      try {
        const content = await this.gitOps.readFile(file);
        const validation = await this.syntaxValidator.validate(file, content, level);

        if (!validation.valid) {
          result.passed = false;
          result.errors.push({
            file,
            type: 'syntax-error',
            errors: validation.errors,
          });
        }

        if (validation.warnings && validation.warnings.length > 0) {
          result.warnings.push({
            file,
            type: 'syntax-warning',
            warnings: validation.warnings,
          });
        }
      } catch (error) {
        result.warnings.push({
          file,
          type: 'validation-skip',
          message: `Could not validate: ${error.message}`,
        });
      }
    }

    return result;
  }

  /**
   * Validate import statements
   */
  async validateImports(files) {
    const result = { passed: true, errors: [], warnings: [] };

    const jsFiles = files.filter((f) => /\.(js|jsx|ts|tsx)$/.test(f));

    // Load package.json for package import validation
    await this.loadPackageJson();

    for (const file of jsFiles) {
      try {
        const content = await this.gitOps.readFile(file);
        const imports = this.extractImports(content, file);

        for (const imp of imports) {
          if (imp.type === 'relative') {
            // Check cached resolution first
            const cacheKey = `${file}:${imp.path}`;
            let resolved = this.cache.resolvedPaths.get(cacheKey);
            
            if (!resolved) {
              resolved = this.resolveImportPath(file, imp.path);
              this.cache.resolvedPaths.set(cacheKey, resolved);
            }
            
            const exists = await this.fileExists(resolved);

            if (!exists) {
              result.passed = false;
              result.errors.push({
                file,
                type: 'broken-import',
                import: imp.path,
                line: imp.line,
                message: `Import path does not exist: ${imp.path}`,
              });
            }
          } else if (imp.type === 'package') {
            // Validate package imports against package.json
            const packageName = this.extractPackageName(imp.path);
            if (!this.isPackageInstalled(packageName)) {
              result.warnings.push({
                file,
                type: 'missing-package',
                import: imp.path,
                line: imp.line,
                message: `Package '${packageName}' not found in package.json dependencies`,
              });
            }
          }
        }
      } catch (error) {
        result.warnings.push({
          file,
          type: 'import-check-skip',
          message: `Could not check imports: ${error.message}`,
        });
      }
    }

    return result;
  }

  /**
   * Load package.json for dependency validation
   */
  async loadPackageJson() {
    if (this.cache.packageJson !== null) {
      return this.cache.packageJson;
    }

    try {
      const content = await this.gitOps.readFile('package.json');
      this.cache.packageJson = JSON.parse(content);
    } catch (error) {
      this.cache.packageJson = false;
    }

    return this.cache.packageJson;
  }

  /**
   * Extract package name from import path
   */
  extractPackageName(importPath) {
    // Handle scoped packages (@org/package)
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
    }
    
    // Handle regular packages (package/subpath)
    return importPath.split('/')[0];
  }

  /**
   * Check if package is installed
   */
  isPackageInstalled(packageName) {
    if (!this.cache.packageJson) {
      return true; // Skip check if no package.json
    }

    const pkg = this.cache.packageJson;
    return !!(
      (pkg.dependencies && pkg.dependencies[packageName]) ||
      (pkg.devDependencies && pkg.devDependencies[packageName]) ||
      (pkg.peerDependencies && pkg.peerDependencies[packageName])
    );
  }

  /**
   * Validate TypeScript types
   */
  async validateTypes(files) {
    const result = { passed: true, errors: [], warnings: [] };

    const tsFiles = files.filter((f) => /\.(ts|tsx)$/.test(f));

    if (tsFiles.length === 0) {
      return result;
    }

    // Check if TypeScript is available
    try {
      require.resolve('typescript');
    } catch (error) {
      result.warnings.push({
        type: 'typescript-unavailable',
        message: 'TypeScript not installed, skipping type validation',
      });
      return result;
    }

    // Basic type checking (would need full TypeScript compiler API for comprehensive)
    result.warnings.push({
      type: 'type-validation-limited',
      message: 'Type validation is limited in pre-validation phase',
    });

    return result;
  }

  /**
   * Validate dependency existence and compatibility
   */
  async validateDependencies(files) {
    const result = { passed: true, errors: [], warnings: [] };

    // Check package.json files
    const packageFiles = files.filter((f) => f.endsWith('package.json'));

    for (const file of packageFiles) {
      try {
        const content = await this.gitOps.readFile(file);
        const pkg = JSON.parse(content);

        // Check if dependencies are installed
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        for (const [dep, version] of Object.entries(allDeps)) {
          // Check if dependency exists
          try {
            require.resolve(dep);
          } catch (error) {
            result.warnings.push({
              file,
              type: 'dependency-not-installed',
              package: dep,
              version,
              message: `Dependency ${dep}@${version} may not be installed`,
            });
          }

          // Validate version format
          if (!this.isValidVersionFormat(version)) {
            result.warnings.push({
              file,
              type: 'invalid-version-format',
              package: dep,
              version,
              message: `Invalid version format for ${dep}: ${version}`,
            });
          }
        }

        // Check for peer dependency conflicts
        if (pkg.peerDependencies) {
          for (const [peer, peerVersion] of Object.entries(pkg.peerDependencies)) {
            if (allDeps[peer]) {
              const installedVersion = allDeps[peer];
              if (!this.versionsCompatible(installedVersion, peerVersion)) {
                result.warnings.push({
                  file,
                  type: 'peer-dependency-mismatch',
                  package: peer,
                  installed: installedVersion,
                  required: peerVersion,
                  message: `Peer dependency ${peer} version mismatch: installed ${installedVersion}, required ${peerVersion}`,
                });
              }
            }
          }
        }

        // Check for duplicate dependencies
        if (pkg.dependencies && pkg.devDependencies) {
          const duplicates = Object.keys(pkg.dependencies).filter(
            (dep) => pkg.devDependencies[dep]
          );
          
          if (duplicates.length > 0) {
            result.warnings.push({
              file,
              type: 'duplicate-dependencies',
              packages: duplicates,
              message: `Packages listed in both dependencies and devDependencies: ${duplicates.join(', ')}`,
            });
          }
        }

      } catch (error) {
        result.warnings.push({
          file,
          type: 'dependency-check-skip',
          message: `Could not check dependencies: ${error.message}`,
        });
      }
    }

    return result;
  }

  /**
   * Validate version format
   */
  isValidVersionFormat(version) {
    // Allow common version formats: ^1.0.0, ~1.0.0, >=1.0.0, 1.0.0, *, latest, etc.
    const validPatterns = [
      /^\d+\.\d+\.\d+$/,           // 1.0.0
      /^[\^~>=<]+\d+\.\d+\.\d+$/,  // ^1.0.0, ~1.0.0, >=1.0.0
      /^\*$/,                       // *
      /^latest$/,                   // latest
      /^next$/,                     // next
      /^file:/,                     // file:../path
      /^git\+/,                     // git+https://...
      /^https?:/,                   // https://...
    ];

    return validPatterns.some((pattern) => pattern.test(version));
  }

  /**
   * Check if versions are compatible (basic check)
   */
  versionsCompatible(installed, required) {
    // Remove version prefixes for comparison
    const cleanInstalled = installed.replace(/^[\^~>=<]+/, '');
    const cleanRequired = required.replace(/^[\^~>=<]+/, '');

    // If either is *, latest, or next, consider compatible
    if (['*', 'latest', 'next'].includes(cleanInstalled) ||
        ['*', 'latest', 'next'].includes(cleanRequired)) {
      return true;
    }

    // Basic semver major version check
    const installedMajor = cleanInstalled.split('.')[0];
    const requiredMajor = cleanRequired.split('.')[0];

    return installedMajor === requiredMajor;
  }

  /**
   * Extract import statements from file content
   */
  extractImports(content, file) {
    const imports = [];
    const ext = path.extname(file);

    if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
      // Match ES6 imports
      const importRegex = /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;
      let match;
      let line = 1;

      const lines = content.split('\n');
      lines.forEach((lineContent, index) => {
        const matches = lineContent.matchAll(importRegex);
        for (const m of matches) {
          const importPath = m[1];
          imports.push({
            path: importPath,
            line: index + 1,
            type: importPath.startsWith('.') ? 'relative' : 'package',
          });
        }
      });

      // Match require statements
      const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
      lines.forEach((lineContent, index) => {
        const matches = lineContent.matchAll(requireRegex);
        for (const m of matches) {
          const importPath = m[1];
          imports.push({
            path: importPath,
            line: index + 1,
            type: importPath.startsWith('.') ? 'relative' : 'package',
          });
        }
      });
    }

    return imports;
  }

  /**
   * Resolve relative import path
   */
  resolveImportPath(fromFile, importPath) {
    const dir = path.dirname(fromFile);
    let resolved = path.join(dir, importPath);

    // Try common extensions
    const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '.json'];
    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (this.fileExistsSync(withExt)) {
        return withExt;
      }
    }

    // Try index files
    for (const ext of extensions.slice(1)) {
      const indexFile = path.join(resolved, `index${ext}`);
      if (this.fileExistsSync(indexFile)) {
        return indexFile;
      }
    }

    return resolved;
  }

  /**
   * Check if file exists (async)
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists (sync)
   */
  fileExistsSync(filePath) {
    try {
      require('fs').accessSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate overall validation status
   */
  calculateOverallStatus(validations) {
    return Object.values(validations).every((v) => v.passed);
  }

  /**
   * Count total errors
   */
  countErrors(validations) {
    return Object.values(validations).reduce(
      (sum, v) => sum + (v.errors?.length || 0),
      0
    );
  }

  /**
   * Count total warnings
   */
  countWarnings(validations) {
    return Object.values(validations).reduce(
      (sum, v) => sum + (v.warnings?.length || 0),
      0
    );
  }
}

module.exports = PreValidator;

// Made with Bob
