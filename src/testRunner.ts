import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ClaudeClient } from './claudeClient.js';
import {
  ReviewConfigSchema,
  ClaudeReviewRequest,
  AnalyzedCode,
  CodeChange,
  FileChange,
  ReviewResult,
  ReviewIssue,
  EnvSchema,
} from './types.js';
import {
  formatReviewComment,
  formatInlineComment,
} from './reviewFormatter.js';

// Load environment variables
dotenv.config();

/**
 * Test runner that simulates a code review without requiring a real GitHub PR.
 * Produces the exact same markdown output that would appear on a GitHub PR.
 */
async function runTest(): Promise<void> {
  console.log('🛡️ Deltek CodeSentinel - Test Mode\n');
  console.log('This will test the bot using sample files without creating a real PR.\n');

  try {
    // Step 1: Validate environment
    console.log('Step 1: Validating environment...');
    const env = EnvSchema.pick({ ANTHROPIC_API_KEY: true }).parse({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    });
    console.log('✓ Anthropic API key found\n');

    // Step 2: Load configuration
    console.log('Step 2: Loading configuration...');
    const configPath = path.join(process.cwd(), 'config', 'review-config.json');
    let config;
    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath, 'utf8');
      config = ReviewConfigSchema.parse(JSON.parse(configFile));
    } else {
      config = ReviewConfigSchema.parse({});
    }
    console.log(`✓ Configuration loaded (model: ${config.claudeModel})\n`);

    // Step 3: Create mock analyzed code from test files
    console.log('Step 3: Loading sample code files...');
    const analyzedCode = await loadTestFiles();
    console.log(`✓ Loaded ${analyzedCode.files.length} test files\n`);

    // Step 4: Initialize Claude client
    console.log('Step 4: Initializing Claude client...');
    const claudeClient = new ClaudeClient(
      env.ANTHROPIC_API_KEY,
      config.claudeModel,
      config.maxTokens
    );
    console.log('✓ Claude client ready\n');

    // Step 5: Prepare review request
    console.log('Step 5: Preparing review request...');
    const reviewRequest: ClaudeReviewRequest = {
      code: analyzedCode,
      prContext: {
        title: 'Test PR: Add authentication and calculator features',
        description:
          'This is a test PR with intentional issues to validate the code review bot. ' +
          'It includes security vulnerabilities, bugs, and performance issues.',
        author: 'test-user',
      },
      config,
    };

    const estimatedTokens = claudeClient.estimateTokenCount(reviewRequest);
    console.log(`✓ Estimated tokens: ${estimatedTokens}\n`);

    // Step 6: Run the review
    console.log('Step 6: Running AI code review...');
    console.log('(This may take 30-60 seconds)\n');

    const startTime = Date.now();
    const claudeResponse = await claudeClient.reviewCode(reviewRequest);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✓ Review completed in ${duration}s\n`);

    // Step 7: Build ReviewResult (same as reviewEngine.ts does)
    const overallAssessment = determineOverallAssessment(claudeResponse.issues, config);

    const reviewResult: ReviewResult = {
      issues: claudeResponse.issues,
      summary: claudeResponse.summary,
      overallAssessment,
      positiveFindings: claudeResponse.positiveFindings,
    };

    // Step 8: Generate the exact same GitHub markdown output
    const prReviewBody = formatReviewComment(reviewResult);

    // Generate inline comments (same as githubClient would post on specific lines)
    const inlineComments = reviewResult.issues
      .filter((issue) => issue.line !== undefined)
      .map((issue) => ({
        file: issue.file,
        line: issue.line!,
        body: formatInlineComment(issue),
      }));

    // Determine the review action label
    let reviewAction = 'COMMENT';
    if (overallAssessment === 'approve') reviewAction = 'APPROVE';
    if (overallAssessment === 'request_changes') reviewAction = 'REQUEST_CHANGES';

    // Build the full preview document
    let fullPreview = '';
    fullPreview += `<!-- GitHub PR Review Preview -->\n`;
    fullPreview += `<!-- Review Action: ${reviewAction} -->\n`;
    fullPreview += `<!-- Generated: ${new Date().toISOString()} -->\n`;
    fullPreview += `<!-- Duration: ${duration}s | Issues: ${reviewResult.issues.length} -->\n\n`;

    // Main review comment (exactly what appears at the top of the PR review)
    fullPreview += `# PR Review Comment\n\n`;
    fullPreview += `> This is the main review comment posted on the PR.\n`;
    fullPreview += `> Review action: **${reviewAction}**\n\n`;
    fullPreview += prReviewBody;

    // Inline comments section
    if (inlineComments.length > 0) {
      fullPreview += `\n\n---\n\n`;
      fullPreview += `# Inline Comments\n\n`;
      fullPreview += `> These comments are posted directly on specific lines in the PR diff.\n\n`;

      for (const comment of inlineComments) {
        fullPreview += `### 📍 \`${comment.file}\` (Line ${comment.line})\n\n`;
        fullPreview += comment.body;
        fullPreview += '\n\n---\n\n';
      }
    }

    // Labels section
    const hasCritical = reviewResult.issues.some((i) => i.severity === 'critical');
    const hasHigh = reviewResult.issues.some((i) => i.severity === 'high');
    fullPreview += `# Labels Applied\n\n`;
    if (hasCritical) {
      fullPreview += `- 🏷️ \`security-review-needed\`\n`;
    } else if (hasHigh) {
      fullPreview += `- 🏷️ \`needs-review\`\n`;
    } else {
      fullPreview += `- *(no labels applied)*\n`;
    }

    // Save the preview file
    const outputPath = path.join(process.cwd(), 'test', 'review-preview.md');
    fs.writeFileSync(outputPath, fullPreview, 'utf8');

    // Print to console
    console.log('═══════════════════════════════════════════════════════════');
    console.log('         GITHUB PR REVIEW PREVIEW');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Review Action: ${reviewAction}`);
    console.log(`Issues Found: ${reviewResult.issues.length}`);
    console.log(`Duration: ${duration}s\n`);
    console.log('--- START OF PR REVIEW COMMENT ---\n');
    console.log(prReviewBody);
    console.log('--- END OF PR REVIEW COMMENT ---\n');

    if (inlineComments.length > 0) {
      console.log(`--- INLINE COMMENTS (${inlineComments.length}) ---\n`);
      for (const comment of inlineComments) {
        console.log(`📍 ${comment.file}:${comment.line}`);
        console.log(comment.body);
        console.log('');
      }
      console.log('--- END OF INLINE COMMENTS ---\n');
    }

    if (hasCritical) {
      console.log('Labels: security-review-needed');
    } else if (hasHigh) {
      console.log('Labels: needs-review');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Full preview saved to: test/review-preview.md`);
    console.log('   Open this file in any markdown viewer to see the exact GitHub rendering.\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    console.error('\nPlease fix the error and try again.');
    process.exit(1);
  }
}

/**
 * Determines overall assessment based on issues found (mirrors reviewEngine.ts)
 */
function determineOverallAssessment(
  issues: ReviewIssue[],
  config: { severityThresholds: { critical: boolean; high: boolean } }
): 'approve' | 'request_changes' | 'comment' {
  const hasCritical = issues.some((i) => i.severity === 'critical');
  const hasHigh = issues.some((i) => i.severity === 'high');

  if (
    (config.severityThresholds.critical && hasCritical) ||
    (config.severityThresholds.high && hasHigh)
  ) {
    return 'request_changes';
  }

  if (issues.length === 0 || issues.every((i) => i.severity === 'low' || i.severity === 'info')) {
    return 'approve';
  }

  return 'comment';
}

/**
 * Loads test files and creates mock analyzed code
 */
async function loadTestFiles(): Promise<AnalyzedCode> {
  const testDir = path.join(process.cwd(), 'test', 'sample-code');

  if (!fs.existsSync(testDir)) {
    throw new Error(`Test directory not found: ${testDir}`);
  }

  const files = fs.readdirSync(testDir).filter((f) => !f.startsWith('.'));

  if (files.length === 0) {
    throw new Error('No test files found in test/sample-code/');
  }

  const codeChanges: CodeChange[] = [];

  for (const file of files) {
    const filePath = path.join(testDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const changes: FileChange[] = lines.map((line, idx) => ({
      lineNumber: idx + 1,
      type: 'addition' as const,
      content: line,
      context: lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 3)),
    }));

    codeChanges.push({
      file: `test/sample-code/${file}`,
      language: detectLanguage(file),
      changes,
    });
  }

  const totalLines = codeChanges.reduce((sum, c) => sum + c.changes.length, 0);
  const languages = [...new Set(codeChanges.map((c) => c.language))];

  return {
    files: codeChanges,
    totalLines,
    languages,
    summary: `Test review with ${files.length} files (${totalLines} lines) in ${languages.join(', ')}`,
  };
}

/**
 * Detects language from filename
 */
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'JavaScript',
    ts: 'TypeScript',
    py: 'Python',
    java: 'Java',
    go: 'Go',
    rs: 'Rust',
    rb: 'Ruby',
    php: 'PHP',
  };
  return map[ext] || 'Unknown';
}

// Run the test
runTest();
