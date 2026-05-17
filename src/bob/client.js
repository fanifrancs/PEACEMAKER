import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

function findBobPath() {
  const candidates = [
    // NVM paths — try current user's NVM node versions
    path.join(process.env.HOME, '.nvm/versions/node/v22.22.2/bin/bob'),
    path.join(process.env.HOME, '.nvm/versions/node/v20.19.0/bin/bob'),
    // npm global
    path.join(process.env.HOME, '.npm-global/bin/bob'),
    '/usr/local/bin/bob',
    '/usr/bin/bob',
  ];
  
  // Try each candidate path
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      logger.debug(`Found Bob at: ${p}`);
      return p;
    }
  }
  
  // Fallback: try 'which bob'
  try {
    const whichResult = execSync('which bob', { encoding: 'utf8' }).trim();
    if (whichResult) {
      logger.debug(`Found Bob via 'which': ${whichResult}`);
      return whichResult;
    }
  } catch (error) {
    // which failed
  }
  
  throw new Error('Bob Shell not found. Install it via npm and ensure it is in PATH.');
}

function _executeBobShell(prompt) {
  const bobPath = findBobPath();
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
  const command = `${bobPath} "${escapedPrompt}" --yolo --hide-intermediary-output`;

  logger.debug('[Bob Shell] Executing Bob Shell command');
  
  // Progress logging
  const start = Date.now();
  const interval = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    logger.info(`[Bob Shell] Bob Shell processing... (${elapsed}s elapsed)`);
  }, 10000);

  try {
    const output = execSync(command, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000, // 5 minutes
      shell: '/bin/bash',
      env: {
        ...process.env,
        BOBSHELL_API_KEY: process.env.BOB_API_KEY || process.env.BOBSHELL_API_KEY || '',
      },
      stdio: ['pipe', 'pipe', 'ignore'], // ignore stderr — Bob IDE companion noise
    });

    clearInterval(interval);
    logger.info('[Bob Shell] Bob Shell response received');

    // Bob wraps its final output between ---output--- markers
    const match = output.match(/---output---([\s\S]*?)(?:---output---|$)/);
    if (match) return match[1].trim();
    return output.trim();
  } catch (error) {
    clearInterval(interval);
    logger.error(`[Bob Shell] Bob Shell execution failed: ${error.message}`);
    throw error;
  }
}

export async function mergeFileDirectly(baseContent, mainContent, featureContent, absoluteFilePath, intent) {
  const prompt = `You are resolving a 3-way merge conflict for a software project.

BASE VERSION (common ancestor):
\`\`\`
${baseContent}
\`\`\`

MAIN BRANCH VERSION (what main looks like now):
\`\`\`
${mainContent}
\`\`\`

FEATURE BRANCH VERSION (what the developer added):
\`\`\`
${featureContent}
\`\`\`

DEVELOPER INTENT: ${intent}

Produce a single merged file that:
1. Keeps all functionality from MAIN that is not superseded by FEATURE
2. Incorporates all changes from FEATURE
3. Resolves any conflicts using DEVELOPER INTENT as the tiebreaker
4. Contains NO conflict markers (no <<<<<<<, =======, >>>>>>>)
5. Has correct syntax — every statement ends with exactly one semicolon (do NOT duplicate semicolons)
6. Ends with exactly one newline character

Write the merged result directly to this file: ${absoluteFilePath}

Do not explain. Do not summarize. Just write the file.`;

  await _executeBobShell(prompt);

  // Read back and validate
  let content = fs.readFileSync(absoluteFilePath, 'utf8');

  // Post-processing guards
  content = content.replace(/;;+/g, ';');           // double-semicolon guard
  if (!content.endsWith('\n')) content += '\n';      // EOF newline

  fs.writeFileSync(absoluteFilePath, content, 'utf8');
  
  const lineCount = content.split('\n').length;
  logger.info(`[Bob Merge] Bob wrote ${absoluteFilePath} directly (${lineCount} lines)`);
  
  return content;
}

export async function extractIntentFromBob(prompt) {
  return _executeBobShell(prompt);
}

export async function generateDiagnosticSection(prompt, threadId) {
  logger.debug(`[Thread ${threadId}] Starting Bob Shell call`);
  
  const start = Date.now();
  const interval = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    logger.info(`[Thread ${threadId}] Bob Shell processing... (${elapsed}s elapsed)`);
  }, 10000);

  try {
    const result = await _executeBobShell(prompt);
    clearInterval(interval);
    
    const elapsed = Math.round((Date.now() - start) / 1000);
    logger.info(`[Thread ${threadId}] response received (${elapsed}s elapsed)`);
    
    return result;
  } catch (error) {
    clearInterval(interval);
    logger.error(`[Thread ${threadId}] Bob Shell call failed: ${error.message}`);
    throw error;
  }
}

export { _executeBobShell };

// Made with Bob
