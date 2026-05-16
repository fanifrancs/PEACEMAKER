/**
 * Format Peacemaker report as GitHub PR comment
 */

function formatPRComment(report) {
  const { guidance, validation } = report;
  
  let comment = '## ⚔️ PEACEMAKER ANALYSIS\n\n';
  
  // Overall Status
  const overallPassed = validation?.passed !== false;
  const statusEmoji = overallPassed ? '✅' : '❌';
  const statusText = overallPassed ? 'Passed' : 'Failed';
  
  comment += `**Status**: ${statusEmoji} ${statusText}\n\n`;
  
  // Summary Section
  comment += '### 📊 Summary\n\n';
  
  if (validation?.summary) {
    const { totalFiles, filesChecked, errorsFound, warningsFound } = validation.summary;
    comment += '| Metric | Value |\n';
    comment += '|--------|-------|\n';
    comment += `| Files Analyzed | ${totalFiles} |\n`;
    comment += `| Files Validated | ${filesChecked} |\n`;
    comment += `| Errors Found | ${errorsFound} ${errorsFound > 0 ? '❌' : '✅'} |\n`;
    comment += `| Warnings Found | ${warningsFound} ${warningsFound > 0 ? '⚠️' : '✅'} |\n`;
    comment += `| Duration | ${validation.duration}ms |\n\n`;
  }
  
  // AI Guidance Section
  if (guidance) {
    comment += '### 🤖 AI Guidance\n\n';
    
    // Developer Intent
    if (guidance.intent) {
      comment += `**Developer Intent**: ${guidance.intent}\n\n`;
    }
    
    // Components Summary
    if (guidance.components) {
      const { conflicts, imports, syntax, structural, dependencies } = guidance.components;
      
      comment += '| Component | Status |\n';
      comment += '|-----------|--------|\n';
      
      if (conflicts) {
        const conflictCount = conflicts.resolutions?.length || 0;
        const resolved = conflicts.resolutions?.filter(r => r.success).length || 0;
        comment += `| Conflicts | ${resolved}/${conflictCount} resolved |\n`;
      }
      
      if (imports) {
        const importIssues = imports.issues?.length || 0;
        comment += `| Imports | ${importIssues} issue(s) found |\n`;
      }
      
      if (syntax) {
        const syntaxIssues = syntax.issues?.length || 0;
        comment += `| Syntax | ${syntaxIssues} issue(s) found |\n`;
      }
      
      if (structural) {
        const structuralIssues = structural.changes?.length || 0;
        comment += `| Structural | ${structuralIssues} change(s) detected |\n`;
      }
      
      if (dependencies) {
        const depIssues = dependencies.issues?.length || 0;
        comment += `| Dependencies | ${depIssues} issue(s) found |\n`;
      }
      
      comment += '\n';
    }
    
    // Recommended Action
    if (guidance.recommendedAction) {
      const { action, priority, reasoning } = guidance.recommendedAction;
      const priorityEmoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢'
      }[priority] || '⚪';
      
      comment += `**Recommended Action**: ${priorityEmoji} ${action}\n`;
      if (reasoning) {
        comment += `**Reasoning**: ${reasoning}\n`;
      }
      comment += '\n';
    }
  }
  
  // Validation Details
  if (validation && !validation.passed) {
    comment += '### ❌ Validation Errors\n\n';
    
    // Syntax Errors
    if (validation.validations?.syntax?.errors?.length > 0) {
      comment += '#### Syntax Errors\n\n';
      validation.validations.syntax.errors.slice(0, 5).forEach((error, index) => {
        comment += `${index + 1}. **${error.file}**\n`;
        if (error.errors) {
          error.errors.forEach(err => {
            comment += `   - ${err.message || err}\n`;
          });
        }
        comment += '\n';
      });
      
      if (validation.validations.syntax.errors.length > 5) {
        comment += `_... and ${validation.validations.syntax.errors.length - 5} more_\n\n`;
      }
    }
    
    // Import Errors
    if (validation.validations?.imports?.errors?.length > 0) {
      comment += '#### Import Errors\n\n';
      validation.validations.imports.errors.slice(0, 5).forEach((error, index) => {
        comment += `${index + 1}. **${error.file}:${error.line}**\n`;
        comment += `   - Import: \`${error.import}\`\n`;
        comment += `   - ${error.message}\n\n`;
      });
      
      if (validation.validations.imports.errors.length > 5) {
        comment += `_... and ${validation.validations.imports.errors.length - 5} more_\n\n`;
      }
    }
  }
  
  // Warnings Section
  if (validation?.validations) {
    const allWarnings = [
      ...(validation.validations.syntax?.warnings || []),
      ...(validation.validations.imports?.warnings || []),
      ...(validation.validations.types?.warnings || []),
      ...(validation.validations.dependencies?.warnings || [])
    ];
    
    if (allWarnings.length > 0) {
      comment += '### ⚠️ Warnings\n\n';
      comment += '<details>\n';
      comment += '<summary>Click to expand warnings</summary>\n\n';
      
      allWarnings.slice(0, 10).forEach((warning, index) => {
        comment += `${index + 1}. ${warning.file || warning.type}: ${warning.message}\n`;
      });
      
      if (allWarnings.length > 10) {
        comment += `\n_... and ${allWarnings.length - 10} more warnings_\n`;
      }
      
      comment += '\n</details>\n\n';
    }
  }
  
  // Confidence Score
  if (guidance?.overallConfidence) {
    const confidence = Math.round(guidance.overallConfidence * 100);
    const confidenceBar = '█'.repeat(Math.floor(confidence / 10)) + '░'.repeat(10 - Math.floor(confidence / 10));
    comment += `### 📈 Overall Confidence: ${confidence}%\n`;
    comment += `\`${confidenceBar}\`\n\n`;
  }
  
  // Next Steps
  comment += '### 🎯 Next Steps\n\n';
  
  if (!overallPassed) {
    comment += '1. ❌ Fix validation errors listed above\n';
    comment += '2. 🔄 Push changes to trigger re-analysis\n';
    comment += '3. ✅ Wait for Peacemaker to re-validate\n';
  } else if (guidance?.recommendedAction?.priority === 'critical' || guidance?.recommendedAction?.priority === 'high') {
    comment += '1. ⚠️ Review AI guidance recommendations\n';
    comment += '2. 🔍 Address high-priority issues\n';
    comment += '3. ✅ Proceed with merge after review\n';
  } else {
    comment += '1. ✅ Pre-validation passed\n';
    comment += '2. 👀 Review AI suggestions (optional)\n';
    comment += '3. 🚀 Ready for CI pipeline\n';
  }
  
  comment += '\n---\n';
  comment += '_Generated by [Peacemaker](https://github.com/fanifrancs/PEACEMAKER) - AI-Assisted Merge Guidance_\n';
  
  return comment;
}

module.exports = { formatPRComment };

// Made with Bob
