import { execSync } from 'child_process';
import logger from '../utils/logger.js';
import { getChangedFiles } from '../git/operations.js';
import { execSync as exec } from 'child_process';

/**
 * Analyzes code changes using Bob Shell to identify potential issues
 * @param {string} filePath - Path to the file to analyze
 * @param {string} diff - Git diff content for the file
 * @returns {Promise<Object>} Analysis results with issues found
 */
export async function analyzeChanges(filePath, diff) {
  logger.info(`Analyzing changes in ${filePath}`);
  
  try {
    // Prepare the analysis prompt for Bob
    const prompt = `Analyze the following git diff for potential issues, bugs, or improvements needed:

File: ${filePath}

Diff:
${diff}

Please identify:
1. Potential bugs or logic errors
2. Code quality issues
3. Security concerns
4. Performance problems
5. Best practice violations

Provide a structured analysis with severity levels (critical, high, medium, low).`;

    // Call Bob Shell for analysis
    const bobCommand = `bob "${prompt.replace(/"/g, '\\"')}"`;
    
    logger.debug(`Executing Bob analysis for ${filePath}`);
    const output = execSync(bobCommand, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 60000 // 60 second timeout
    });

    // Parse Bob's response
    const analysis = parseBobAnalysis(output, filePath);
    
    logger.info(`Analysis complete for ${filePath}: ${analysis.issues.length} issues found`);
    return analysis;
    
  } catch (error) {
    logger.error(`Failed to analyze ${filePath}:`, error);
    return {
      filePath,
      issues: [],
      error: error.message
    };
  }
}

/**
 * Analyzes multiple files in parallel
 * @param {Array<{path: string, diff: string}>} files - Array of files with their diffs
 * @returns {Promise<Array<Object>>} Array of analysis results
 */
export async function analyzeMultipleFiles(files) {
  logger.info(`Analyzing ${files.length} files in parallel`);
  
  const analyses = await Promise.all(
    files.map(file => analyzeChanges(file.path, file.diff))
  );
  
  return analyses;
}

/**
 * Parses Bob's analysis output into structured format
 * @param {string} output - Raw output from Bob
 * @param {string} filePath - File path being analyzed
 * @returns {Object} Structured analysis results
 */
function parseBobAnalysis(output, filePath) {
  const issues = [];
  
  // Extract issues from Bob's response
  // Bob typically provides structured feedback with severity indicators
  const lines = output.split('\n');
  let currentIssue = null;
  
  for (const line of lines) {
    // Look for severity indicators
    const severityMatch = line.match(/\b(critical|high|medium|low)\b/i);
    if (severityMatch) {
      if (currentIssue) {
        issues.push(currentIssue);
      }
      currentIssue = {
        severity: severityMatch[1].toLowerCase(),
        description: line.trim(),
        line: extractLineNumber(line)
      };
    } else if (currentIssue && line.trim()) {
      // Continue building current issue description
      currentIssue.description += '\n' + line.trim();
    }
  }
  
  // Add last issue if exists
  if (currentIssue) {
    issues.push(currentIssue);
  }
  
  // If no structured issues found, create a general analysis
  if (issues.length === 0 && output.trim()) {
    issues.push({
      severity: 'medium',
      description: output.trim(),
      line: null
    });
  }
  
  return {
    filePath,
    issues,
    summary: generateSummary(issues)
  };
}

/**
 * Extracts line number from issue description
 * @param {string} text - Text that may contain line number
 * @returns {number|null} Line number or null
 */
function extractLineNumber(text) {
  const match = text.match(/line\s+(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Generates a summary of issues by severity
 * @param {Array<Object>} issues - Array of issues
 * @returns {Object} Summary statistics
 */
function generateSummary(issues) {
  const summary = {
    total: issues.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  
  for (const issue of issues) {
    const severity = issue.severity.toLowerCase();
    if (summary.hasOwnProperty(severity)) {
      summary[severity]++;
    }
  }
  
  return summary;
}

/**
 * Performs semantic analysis of merge conflicts
 * @param {Array<Object>} conflicts - Array of conflict objects
 * @returns {Promise<Object>} Semantic analysis results
 */
export async function analyzeConflicts(conflicts) {
  logger.info(`Performing semantic analysis of ${conflicts.length} conflicts`);
  
  const analyses = [];
  
  for (const conflict of conflicts) {
    try {
      const prompt = `Analyze this merge conflict semantically:

File: ${conflict.path}

Base version:
${conflict.base || 'N/A'}

Current branch version:
${conflict.ours || 'N/A'}

Incoming branch version:
${conflict.theirs || 'N/A'}

Determine:
1. The semantic intent of each version
2. Whether the changes are compatible
3. The best resolution strategy
4. Any potential issues with merging`;

      const bobCommand = `bob "${prompt.replace(/"/g, '\\"')}"`;
      
      const output = execSync(bobCommand, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000
      });
      
      analyses.push({
        path: conflict.path,
        analysis: output.trim(),
        recommendation: extractRecommendation(output)
      });
      
    } catch (error) {
      logger.error(`Failed to analyze conflict in ${conflict.path}:`, error);
      analyses.push({
        path: conflict.path,
        error: error.message
      });
    }
  }
  
  return {
    conflicts: analyses,
    summary: generateConflictSummary(analyses)
  };
}

/**
 * Extracts resolution recommendation from Bob's analysis
 * @param {string} output - Bob's analysis output
 * @returns {string} Recommendation
 */
function extractRecommendation(output) {
  // Look for recommendation keywords
  const lines = output.split('\n');
  for (const line of lines) {
    if (line.match(/recommend|suggest|should|best/i)) {
      return line.trim();
    }
  }
  return 'Manual review recommended';
}

/**
 * Generates summary of conflict analyses
 * @param {Array<Object>} analyses - Array of conflict analyses
 * @returns {Object} Summary
 */
function generateConflictSummary(analyses) {
  return {
    total: analyses.length,
    analyzed: analyses.filter(a => !a.error).length,
    failed: analyses.filter(a => a.error).length
  };
}

/**
 * Builds comprehensive merge analysis
 * @param {string} featureBranch - Feature branch name
 * @param {string} baseBranch - Base branch name
 * @param {Object} classification - Merge classification
 * @returns {Promise<Object>} Merge analysis
 */
export async function buildMergeAnalysis(featureBranch, baseBranch, classification) {
  logger.info(`Building merge analysis for ${featureBranch} -> ${baseBranch}`);
  
  try {
    // Get changed files
    const changedFiles = await getChangedFiles(featureBranch, baseBranch);
    
    // Get diff for each file
    const filesWithDiffs = [];
    for (const file of changedFiles) {
      try {
        const diff = exec(`git diff ${baseBranch}...${featureBranch} -- "${file}"`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        });
        filesWithDiffs.push({ path: file, diff });
      } catch (error) {
        logger.warn(`Failed to get diff for ${file}: ${error.message}`);
      }
    }
    
    // Analyze files
    const analyses = await analyzeMultipleFiles(filesWithDiffs);
    
    // Aggregate results
    const allIssues = analyses.flatMap(a => a.issues || []);
    const summary = generateSummary(allIssues);
    
    return {
      featureBranch,
      baseBranch,
      tier: classification.tier,
      filesAnalyzed: changedFiles.length,
      issues: allIssues,
      summary,
      fileAnalyses: analyses
    };
    
  } catch (error) {
    logger.error(`Failed to build merge analysis: ${error.message}`);
    return {
      featureBranch,
      baseBranch,
      tier: classification.tier,
      error: error.message,
      issues: [],
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
    };
  }
}

/**
 * Formats analysis results for terminal display
 * @param {Object} analysis - Analysis results
 * @returns {string} Formatted text for terminal
 */
export function formatAnalysisForTerminal(analysis) {
  if (!analysis || !analysis.issues || analysis.issues.length === 0) {
    return 'No issues found.';
  }
  
  let output = `\n📊 Analysis Results for ${analysis.filePath}\n`;
  output += `${'='.repeat(60)}\n\n`;
  
  // Summary
  const summary = analysis.summary || generateSummary(analysis.issues);
  output += `Total Issues: ${summary.total}\n`;
  if (summary.critical > 0) output += `  🔴 Critical: ${summary.critical}\n`;
  if (summary.high > 0) output += `  🟠 High: ${summary.high}\n`;
  if (summary.medium > 0) output += `  🟡 Medium: ${summary.medium}\n`;
  if (summary.low > 0) output += `  🟢 Low: ${summary.low}\n`;
  output += '\n';
  
  // Issues
  for (let i = 0; i < analysis.issues.length; i++) {
    const issue = analysis.issues[i];
    const icon = getSeverityIcon(issue.severity);
    output += `${i + 1}. ${icon} ${issue.severity.toUpperCase()}`;
    if (issue.line) output += ` (Line ${issue.line})`;
    output += '\n';
    output += `   ${issue.description}\n\n`;
  }
  
  return output;
}

/**
 * Gets icon for severity level
 * @param {string} severity - Severity level
 * @returns {string} Icon
 */
function getSeverityIcon(severity) {
  const icons = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  };
  return icons[severity.toLowerCase()] || '⚪';
}

// Made with Bob
