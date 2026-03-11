import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { GitHubClient } from './githubClient.js';
import { CodeAnalyzer } from './codeAnalyzer.js';
import { ClaudeClient } from './claudeClient.js';
import { ReviewEngine } from './reviewEngine.js';
import { Notifier } from './notifier.js';
import {
  EnvSchema,
  ReviewConfigSchema,
  GitHubContext,
  ReviewConfig,
  ConfigError,
} from './types.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the code review bot
 */
async function main(): Promise<void> {
  try {
    console.log('🛡️ Deltek CodeSentinel Starting...\n');

    // Step 1: Load and validate environment variables
    const env = loadEnvironment();

    // Step 2: Extract GitHub context
    const githubContext = extractGitHubContext(env);
    console.log(`Repository: ${githubContext.owner}/${githubContext.repository}`);
    console.log(`Pull Request: #${githubContext.pullNumber}\n`);

    // Step 3: Load configuration
    const config = loadConfig();
    console.log('Configuration loaded successfully\n');

    // Step 4: Initialize clients
    const githubClient = new GitHubClient(githubContext);
    const claudeClient = new ClaudeClient(
      env.ANTHROPIC_API_KEY,
      config.claudeModel,
      config.maxTokens
    );
    const codeAnalyzer = new CodeAnalyzer(config);
    const notifier = new Notifier(
      process.env.INPUT_SLACK_WEBHOOK,
      process.env.INPUT_TEAMS_WEBHOOK
    );

    // Step 5: Create review engine
    const reviewEngine = new ReviewEngine(
      githubClient,
      claudeClient,
      codeAnalyzer,
      config,
      notifier
    );

    // Step 6: Run the review
    const assessment = await reviewEngine.review();

    if (assessment === 'request_changes') {
      console.log('\n🚫 Deltek CodeSentinel: CHANGES REQUESTED — merge blocked until issues are resolved.');
      process.exit(1);
    }

    console.log('\n✅ Deltek CodeSentinel: Review passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Code review failed:');
    console.error(error);

    if (error instanceof ConfigError) {
      console.error('\n💡 Configuration error. Please check your setup and environment variables.');
    }

    process.exit(1);
  }
}

/**
 * Loads and validates environment variables
 */
function loadEnvironment() {
  try {
    const env = EnvSchema.parse({
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
      GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
    });

    console.log('Environment variables validated ✓');
    return env;
  } catch (error) {
    throw new ConfigError(
      'Missing or invalid environment variables. Please ensure GITHUB_TOKEN and ANTHROPIC_API_KEY are set.',
      error
    );
  }
}

/**
 * Extracts GitHub context from environment variables
 */
function extractGitHubContext(env: ReturnType<typeof loadEnvironment>): GitHubContext {
  // Method 1: From GitHub Actions event
  if (env.GITHUB_EVENT_PATH && fs.existsSync(env.GITHUB_EVENT_PATH)) {
    try {
      const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));

      if (event.pull_request) {
        const [owner, repo] = event.repository.full_name.split('/');

        return {
          owner,
          repository: repo,
          pullNumber: event.pull_request.number,
          token: env.GITHUB_TOKEN,
        };
      }
    } catch (error) {
      console.warn('Failed to parse GitHub event:', error);
    }
  }

  // Method 2: From environment variables (fallback for testing)
  if (env.GITHUB_REPOSITORY) {
    const [owner, repo] = env.GITHUB_REPOSITORY.split('/');
    const pullNumber = parseInt(process.env.PR_NUMBER || '0', 10);

    if (pullNumber > 0) {
      return {
        owner,
        repository: repo,
        pullNumber,
        token: env.GITHUB_TOKEN,
      };
    }
  }

  throw new ConfigError(
    'Could not extract GitHub context. Ensure this is running in a GitHub Actions pull_request event, ' +
    'or set GITHUB_REPOSITORY and PR_NUMBER environment variables for testing.'
  );
}

/**
 * Loads and validates configuration.
 * Priority: action inputs (INPUT_* env vars) > config file > defaults.
 */
function loadConfig(): ReviewConfig {
  const customConfigPath = process.env.INPUT_CONFIG_PATH;
  const defaultConfigPath = path.join(process.cwd(), 'config', 'review-config.json');
  const configPath = customConfigPath && fs.existsSync(customConfigPath)
    ? customConfigPath
    : defaultConfigPath;

  let fileConfig: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(configFile);
    } else {
      console.log('No config file found, using defaults');
    }
  } catch (error) {
    console.warn('Failed to load config file, using defaults:', error);
  }

  const actionOverrides = getActionInputOverrides();
  const mergedConfig = { ...fileConfig, ...actionOverrides };

  return ReviewConfigSchema.parse(mergedConfig);
}

/**
 * Reads action inputs from INPUT_* environment variables and converts
 * them to config overrides. Only sets values that are explicitly provided.
 */
function getActionInputOverrides(): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  if (process.env.INPUT_MODEL) {
    overrides.claudeModel = process.env.INPUT_MODEL;
  }

  if (process.env.INPUT_MAX_TOKENS) {
    overrides.maxTokens = parseInt(process.env.INPUT_MAX_TOKENS, 10);
  }

  if (process.env.INPUT_MAX_PR_SIZE) {
    overrides.maxPRSize = parseInt(process.env.INPUT_MAX_PR_SIZE, 10);
  }

  if (process.env.INPUT_REVIEW_FOCUS) {
    const areas = process.env.INPUT_REVIEW_FOCUS.split(',').map(s => s.trim());
    overrides.reviewFocusAreas = {
      security: areas.includes('security'),
      bugs: areas.includes('bugs'),
      codeQuality: areas.includes('codeQuality'),
      performance: areas.includes('performance'),
      bestPractices: areas.includes('bestPractices'),
    };
  }

  if (process.env.INPUT_BLOCK_ON) {
    const severities = process.env.INPUT_BLOCK_ON.split(',').map(s => s.trim());
    overrides.severityThresholds = {
      critical: severities.includes('critical'),
      high: severities.includes('high'),
      medium: severities.includes('medium'),
      low: severities.includes('low'),
    };
  }

  if (process.env.INPUT_EXCLUDED_FILES) {
    const existing = [
      'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      '*.min.js', '*.min.css', 'dist/**', 'build/**', 'node_modules/**',
    ];
    const extra = process.env.INPUT_EXCLUDED_FILES.split(',').map(s => s.trim());
    overrides.excludedFiles = [...existing, ...extra];
  }

  if (process.env.INPUT_CODING_STANDARDS_ENABLED === 'true') {
    overrides.codingStandards = {
      enabled: true,
      paradigm: process.env.INPUT_CODING_STANDARDS_PARADIGM || undefined,
      rules: process.env.INPUT_CODING_STANDARDS_RULES
        ? process.env.INPUT_CODING_STANDARDS_RULES.split('|').map(s => s.trim())
        : [],
      languageRules: {},
    };
  }

  return overrides;
}

// Run the main function
main();
