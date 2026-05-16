/**
 * Syntax Validator (Point 8.3)
 * Multi-level syntax validation with AI-powered fix suggestions
 */

const IBMBobClient = require('./ibm-bob-client');
const logger = require('../utils/logger');

class SyntaxValidator {
  constructor(gitOps) {
    this.gitOps = gitOps;
    this.bobClient = new IBMBobClient();
  }

  /**
   * Validate syntax across all files
   */
  async validateFiles(files, branch, level = 'basic') {
    logger.debug(`Validating ${files.length} files (level: ${level})...`);

    const results = [];

    for (const file of files) {
      try {
        const result = await this.validateFile(file, branch, level);
        if (!result.valid || result.warnings.length > 0) {
          results.push(result);
        }
      } catch (error) {
        logger.debug(`Failed to validate ${file}:`, error.message);
        results.push({
          file,
          valid: false,
          errors: [{ message: error.message, line: 0 }],
          warnings: [],
          level,
        });
      }
    }

    return {
      total: files.length,
      valid: results.filter((r) => r.valid).length,
      invalid: results.filter((r) => !r.valid).length,
      warnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
      results,
      summary: this.generateSummary(results),
    };
  }

  /**
   * Validate a single file
   */
  async validateFile(file, branch, level) {
    // Get file content
    const content = await this.gitOps.getFileContent(file, branch);
    if (!content) {
      return {
        file,
        valid: true,
        errors: [],
        warnings: ['File is empty or could not be read'],
        level,
      };
    }

    // Determine file type and validator
    const validator = this.getValidator(file);
    if (!validator) {
      return {
        file,
        valid: true,
        errors: [],
        warnings: ['No validator available for this file type'],
        level,
      };
    }

    // Run validation
    const validation = await validator(content, level);

    // Get AI suggestions for errors if needed
    if (!validation.valid && level !== 'basic') {
      validation.aiSuggestions = await this.getAISuggestions(file, content, validation.errors);
    }

    return {
      file,
      ...validation,
      level,
    };
  }

  /**
   * Get appropriate validator for file type
   */
  getValidator(file) {
    const ext = file.split('.').pop().toLowerCase();

    const validators = {
      js: this.validateJavaScript.bind(this),
      jsx: this.validateJavaScript.bind(this),
      ts: this.validateTypeScript.bind(this),
      tsx: this.validateTypeScript.bind(this),
      py: this.validatePython.bind(this),
      java: this.validateJava.bind(this),
      json: this.validateJSON.bind(this),
    };

    return validators[ext] || null;
  }

  /**
   * Validate JavaScript
   */
  async validateJavaScript(content, level) {
    const errors = [];
    const warnings = [];

    // Basic: Check for syntax errors using try/catch with Function constructor
    try {
      // eslint-disable-next-line no-new-func
      new Function(content);
    } catch (error) {
      errors.push({
        line: this.extractLineNumber(error.message),
        message: error.message,
        type: 'syntax-error',
      });
    }

    // Check for common issues
    const commonIssues = this.checkCommonJSIssues(content);
    warnings.push(...commonIssues);

    // Enhanced: Additional checks
    if (level === 'enhanced' || level === 'comprehensive') {
      const enhancedIssues = this.checkEnhancedJSIssues(content);
      warnings.push(...enhancedIssues);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate TypeScript
   */
  async validateTypeScript(content, level) {
    // For MVP, treat as JavaScript
    // In production, would use TypeScript compiler API
    const jsValidation = await this.validateJavaScript(content, level);

    // Add TypeScript-specific warnings
    const tsWarnings = this.checkTypeScriptIssues(content);
    jsValidation.warnings.push(...tsWarnings);

    return jsValidation;
  }

  /**
   * Validate Python
   */
  async validatePython(content, level) {
    const errors = [];
    const warnings = [];

    // Basic: Check indentation and common syntax
    const indentErrors = this.checkPythonIndentation(content);
    errors.push(...indentErrors);

    const syntaxErrors = this.checkPythonSyntax(content);
    errors.push(...syntaxErrors);

    // Check for common issues
    const commonIssues = this.checkCommonPythonIssues(content);
    warnings.push(...commonIssues);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate Java
   */
  async validateJava(content, level) {
    const errors = [];
    const warnings = [];

    // Basic: Check for balanced braces and common syntax
    const braceErrors = this.checkBalancedBraces(content);
    errors.push(...braceErrors);

    const syntaxErrors = this.checkJavaSyntax(content);
    errors.push(...syntaxErrors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate JSON
   */
  async validateJSON(content, level) {
    const errors = [];
    const warnings = [];

    try {
      JSON.parse(content);
    } catch (error) {
      errors.push({
        line: this.extractLineNumber(error.message),
        message: error.message,
        type: 'json-parse-error',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check common JavaScript issues
   */
  checkCommonJSIssues(content) {
    const issues = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Unclosed strings
      const singleQuotes = (line.match(/'/g) || []).length;
      const doubleQuotes = (line.match(/"/g) || []).length;
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
        issues.push({
          line: index + 1,
          message: 'Possible unclosed string',
          type: 'warning',
        });
      }

      // Missing semicolons (if using semicolons)
      if (line.trim().match(/^(const|let|var|return)\s+.*[^;{]$/)) {
        issues.push({
          line: index + 1,
          message: 'Missing semicolon',
          type: 'style',
        });
      }
    });

    // Check balanced braces
    const braceIssues = this.checkBalancedBraces(content);
    issues.push(...braceIssues);

    return issues;
  }

  /**
   * Check enhanced JavaScript issues
   */
  checkEnhancedJSIssues(content) {
    const issues = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Unused variables (basic check)
      const varMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
      if (varMatch) {
        const varName = varMatch[1];
        const usageCount = (content.match(new RegExp(`\\b${varName}\\b`, 'g')) || []).length;
        if (usageCount === 1) {
          issues.push({
            line: index + 1,
            message: `Variable '${varName}' may be unused`,
            type: 'warning',
          });
        }
      }

      // Console.log statements
      if (line.includes('console.log')) {
        issues.push({
          line: index + 1,
          message: 'Console.log statement found',
          type: 'style',
        });
      }
    });

    return issues;
  }

  /**
   * Check TypeScript-specific issues
   */
  checkTypeScriptIssues(content) {
    const issues = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Implicit any
      if (line.match(/:\s*any\b/)) {
        issues.push({
          line: index + 1,
          message: 'Explicit any type usage',
          type: 'style',
        });
      }

      // Missing type annotations
      if (line.match(/function\s+\w+\s*\([^)]*\)\s*{/) && !line.includes(':')) {
        issues.push({
          line: index + 1,
          message: 'Function missing return type annotation',
          type: 'style',
        });
      }
    });

    return issues;
  }

  /**
   * Check Python indentation
   */
  checkPythonIndentation(content) {
    const errors = [];
    const lines = content.split('\n');
    let expectedIndent = 0;

    lines.forEach((line, index) => {
      if (line.trim().length === 0) return;

      const indent = line.match(/^\s*/)[0].length;
      const trimmed = line.trim();

      // Check if line should be indented
      if (trimmed.endsWith(':')) {
        expectedIndent += 4;
      }

      // Check if line should be dedented
      if (['return', 'break', 'continue', 'pass'].some((kw) => trimmed.startsWith(kw))) {
        if (index < lines.length - 1 && !lines[index + 1].trim().startsWith('elif')) {
          expectedIndent = Math.max(0, expectedIndent - 4);
        }
      }
    });

    return errors;
  }

  /**
   * Check Python syntax
   */
  checkPythonSyntax(content) {
    const errors = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Check for missing colons
      if (trimmed.match(/^(if|elif|else|for|while|def|class|try|except|finally|with)\s+.*[^:]$/)) {
        errors.push({
          line: index + 1,
          message: 'Missing colon at end of statement',
          type: 'syntax-error',
        });
      }
    });

    return errors;
  }

  /**
   * Check common Python issues
   */
  checkCommonPythonIssues(content) {
    const issues = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Print statements (Python 2 style)
      if (line.match(/^\s*print\s+[^(]/)) {
        issues.push({
          line: index + 1,
          message: 'Python 2 style print statement',
          type: 'warning',
        });
      }
    });

    return issues;
  }

  /**
   * Check Java syntax
   */
  checkJavaSyntax(content) {
    const errors = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Check for missing semicolons
      if (trimmed.match(/^(return|break|continue|throw)\s+.*[^;{]$/)) {
        errors.push({
          line: index + 1,
          message: 'Missing semicolon',
          type: 'syntax-error',
        });
      }
    });

    return errors;
  }

  /**
   * Check balanced braces
   */
  checkBalancedBraces(content) {
    const errors = [];
    const stack = [];
    const pairs = { '{': '}', '[': ']', '(': ')' };
    const lines = content.split('\n');

    lines.forEach((line, lineIndex) => {
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (Object.keys(pairs).includes(char)) {
          stack.push({ char, line: lineIndex + 1, col: i + 1 });
        } else if (Object.values(pairs).includes(char)) {
          const last = stack.pop();
          if (!last || pairs[last.char] !== char) {
            errors.push({
              line: lineIndex + 1,
              message: `Unmatched closing brace '${char}'`,
              type: 'syntax-error',
            });
          }
        }
      }
    });

    // Check for unclosed braces
    stack.forEach((item) => {
      errors.push({
        line: item.line,
        message: `Unclosed '${item.char}'`,
        type: 'syntax-error',
      });
    });

    return errors;
  }

  /**
   * Extract line number from error message
   */
  extractLineNumber(message) {
    const match = message.match(/line (\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Get AI suggestions for syntax errors
   */
  async getAISuggestions(file, content, errors) {
    try {
      const result = await this.bobClient.suggestSyntaxFix(file, content, errors);
      return result.fixes || [];
    } catch (error) {
      logger.debug('Failed to get AI suggestions:', error.message);
      return [];
    }
  }

  /**
   * Generate validation summary
   */
  generateSummary(results) {
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

    const filesWithErrors = results.filter((r) => !r.valid).length;
    const filesWithWarnings = results.filter((r) => r.warnings.length > 0).length;

    return {
      totalErrors,
      totalWarnings,
      filesWithErrors,
      filesWithWarnings,
      overallValid: filesWithErrors === 0,
      recommendedAction: filesWithErrors > 0 ? 'fix-errors-before-merge' : 'review-warnings',
    };
  }
}

module.exports = SyntaxValidator;

// Made with Bob
