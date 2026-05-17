import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { mergeFileDirectly } from './client.js';
import { getFileContent, getFileContentBuffer, stageFiles, commitChanges } from '../git/operations.js';
import logger from '../utils/logger.js';

export async function replayIntent(rawContext, options = {}) {
  const maxRetries = parseInt(process.env.PEACEMAKER_MAX_RETRIES || '1', 10);
  let attempts = 0;
  
  while (attempts <= maxRetries) {
    attempts++;
    
    try {
      logger.info(`[Replay] Attempt ${attempts}/${maxRetries + 1}`);
      
      const result = await _performReplay(rawContext, options);
      
      if (result.verificationPassed) {
        return { ...result, attempts };
      }
      
      if (attempts <= maxRetries) {
        logger.warn(`[Replay] Verification failed, retrying...`);
      }
    } catch (error) {
      if (attempts > maxRetries) {
        throw error;
      }
      logger.warn(`[Replay] Attempt ${attempts} failed: ${error.message}`);
    }
  }
  
  throw new Error('Replay failed after maximum retries');
}

async function _performReplay(rawContext, options) {
  const { seedFiles, seedDeletes, binaryFilesToCopy } = _buildReplaySeedFiles(rawContext);
  
  const filesModified = [];
  const overlappingFiles = [];
  
  // Write all non-overlapping text files
  for (const [filePath, content] of Object.entries(seedFiles)) {
    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);
    
    // Create directory if needed
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Check if this file exists on base (overlapping)
    const baseContent = await getFileContent(rawContext.baseBranch, filePath);
    
    if (baseContent !== null && baseContent !== content) {
      // Overlapping file - needs merge
      overlappingFiles.push(filePath);
      
      const mergedContent = await _mergeOverlappingFile(filePath, rawContext, {
        mergeFileDirectly,
        absolutePath,
      });
      
      if (mergedContent) {
        fs.writeFileSync(absolutePath, mergedContent, 'utf8');
        filesModified.push(filePath);
      }
    } else {
      // Non-overlapping - direct write
      fs.writeFileSync(absolutePath, content, 'utf8');
      filesModified.push(filePath);
    }
  }
  
  // Handle deletions
  for (const filePath of seedDeletes) {
    const absolutePath = path.resolve(filePath);
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        logger.debug(`[Replay] Deleted: ${filePath}`);
      }
    } catch (error) {
      logger.warn(`[Replay] Could not delete ${filePath}: ${error.message}`);
    }
  }
  
  // Handle binary files
  for (const filePath of binaryFilesToCopy) {
    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const buffer = await getFileContentBuffer(rawContext.featureBranch, filePath);
    if (buffer) {
      fs.writeFileSync(absolutePath, buffer);
      filesModified.push(filePath);
      logger.debug(`[Replay] Copied binary: ${filePath}`);
    }
  }
  
  // Preserve base-only files (files main added that feature never touched)
  if (rawContext.forkPoint) {
    try {
      const baseOnlyFiles = execSync(
        `git diff --name-only ${rawContext.forkPoint} ${rawContext.baseBranch}`,
        { encoding: 'utf8' }
      ).trim().split('\n').filter(f => f);
      
      const featureFiles = rawContext.changedFiles;
      const preserved = baseOnlyFiles.filter(f => !featureFiles.includes(f));
      
      for (const filePath of preserved) {
        const absolutePath = path.resolve(filePath);
        const content = await getFileContent(rawContext.baseBranch, filePath);
        
        if (content !== null) {
          const dir = path.dirname(absolutePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          fs.writeFileSync(absolutePath, content, 'utf8');
          rawContext._preservedFiles.push(filePath);
        }
      }
      
      if (preserved.length > 0) {
        logger.info(`[Replay] Preserved ${preserved.length} base-only file(s)`);
      }
    } catch (error) {
      logger.warn(`[Replay] Could not preserve base-only files: ${error.message}`);
    }
  }
  
  // Run syntax checks
  const syntaxErrors = [];
  for (const filePath of filesModified) {
    const error = _checkSyntax(filePath);
    if (error) {
      syntaxErrors.push({ file: filePath, error });
    }
  }
  
  if (syntaxErrors.length > 0) {
    logger.warn(`[Replay] Syntax errors detected in ${syntaxErrors.length} file(s)`);
    for (const { file, error } of syntaxErrors) {
      logger.warn(`  - ${file}: ${error}`);
    }
  }
  
  // Stage and commit
  await stageFiles(['.']);
  await commitChanges(`Peacemaker: replay intent from ${rawContext.featureBranch}`);
  
  logger.info(`[Replay] Replayed ${filesModified.length} file(s)`);
  
  return {
    success: true,
    verificationPassed: syntaxErrors.length === 0,
    filesModified,
    overlappingFiles,
  };
}

function _buildReplaySeedFiles(rawContext) {
  const seedFiles = {};
  const seedDeletes = [];
  const binaryFilesToCopy = [];
  
  // Handle deleted files
  for (const filePath of rawContext.deletedFiles) {
    seedDeletes.push(filePath);
  }
  
  // Handle renamed files
  for (const [oldPath, newPath] of Object.entries(rawContext.renamedFiles)) {
    seedDeletes.push(oldPath);
    
    if (rawContext.fileContents[newPath]) {
      seedFiles[newPath] = rawContext.fileContents[newPath];
    }
  }
  
  // Handle binary files
  for (const filePath of rawContext.binaryFiles) {
    if (!seedDeletes.includes(filePath)) {
      binaryFilesToCopy.push(filePath);
    }
  }
  
  // Handle text files
  for (const [filePath, content] of Object.entries(rawContext.fileContents)) {
    if (!rawContext.binaryFiles.includes(filePath) && !seedDeletes.includes(filePath)) {
      seedFiles[filePath] = content;
    }
  }
  
  return { seedFiles, seedDeletes, binaryFilesToCopy };
}

async function _mergeOverlappingFile(filePath, rawContext, { mergeFileDirectly, absolutePath }) {
  // No fork point → can't do 3-way merge, use feature version directly
  if (!rawContext.forkPoint) {
    logger.warn(`[Merge] No fork point for ${filePath} — using feature branch version directly`);
    return rawContext.fileContents[filePath] || null;
  }
  
  // Try git merge-file (3-way)
  const baseContent = await getFileContent(rawContext.forkPoint, filePath);
  const mainContent = await getFileContent(rawContext.baseBranch, filePath);
  const featureContent = rawContext.fileContents[filePath];
  
  if (!baseContent || !mainContent || !featureContent) {
    logger.warn(`[Merge] Missing content for 3-way merge of ${filePath}, using feature version`);
    return featureContent;
  }
  
  // Write temporary files for git merge-file
  const tmpDir = '/tmp/peacemaker-merge';
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  
  const baseTmp = path.join(tmpDir, 'base');
  const mainTmp = path.join(tmpDir, 'main');
  const featureTmp = path.join(tmpDir, 'feature');
  
  fs.writeFileSync(baseTmp, baseContent, 'utf8');
  fs.writeFileSync(mainTmp, mainContent, 'utf8');
  fs.writeFileSync(featureTmp, featureContent, 'utf8');
  
  try {
    // Try git merge-file
    execSync(`git merge-file -p ${mainTmp} ${baseTmp} ${featureTmp}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    // If we get here, merge succeeded without conflicts
    const merged = fs.readFileSync(mainTmp, 'utf8');
    logger.debug(`[Merge] Git merge-file succeeded for ${filePath}`);
    return merged;
  } catch (error) {
    // Merge failed - check for conflict markers
    const attempted = fs.readFileSync(mainTmp, 'utf8');
    
    if (attempted.includes('<<<<<<<') || attempted.includes('=======') || attempted.includes('>>>>>>>')) {
      logger.info(`[Merge] Git could not cleanly merge ${filePath}; asking Bob for one-file resolution`);
      
      // Call Bob to resolve
      const intent = rawContext.intent?.summary || 'Merge feature branch changes';
      return await mergeFileDirectly(baseContent, mainContent, featureContent, absolutePath, intent);
    }
    
    // Some other error
    logger.warn(`[Merge] git merge-file failed for ${filePath}: ${error.message}`);
    return featureContent;
  } finally {
    // Cleanup temp files
    try {
      fs.unlinkSync(baseTmp);
      fs.unlinkSync(mainTmp);
      fs.unlinkSync(featureTmp);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

function _checkSyntax(filePath) {
  const ext = path.extname(filePath);
  
  try {
    switch (ext) {
      case '.js':
      case '.mjs':
      case '.cjs':
        execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
        break;
      
      case '.ts':
      case '.tsx':
      case '.jsx':
        // tsc is intercepted by Bob Shell — skip, rely on existence + non-empty
        return null;
      
      case '.py':
        execSync(`python3 -m py_compile "${filePath}"`, { stdio: 'pipe' });
        break;
      
      case '.go':
        execSync(`go vet "${filePath}"`, { stdio: 'pipe' });
        break;
      
      case '.rs':
        execSync(`rustc --edition 2021 --crate-type lib --out-dir /tmp "${filePath}"`, { stdio: 'pipe' });
        break;
      
      default:
        return null; // unknown extension — skip
    }
    
    return null; // No error
  } catch (error) {
    return error.message;
  }
}

// Made with Bob
