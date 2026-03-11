import { z } from 'zod';

// Configuration schema
export const ReviewConfigSchema = z.object({
  maxPRSize: z.number().default(500),
  excludedFiles: z.array(z.string()).default([
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '*.min.js',
    '*.min.css',
    'dist/**',
    'build/**',
    'node_modules/**',
    '*.svg',
    '*.png',
    '*.jpg',
    '*.jpeg',
    '*.gif',
    '*.ico',
  ]),
  reviewFocusAreas: z.object({
    security: z.boolean().default(true),
    bugs: z.boolean().default(true),
    codeQuality: z.boolean().default(true),
    performance: z.boolean().default(true),
    bestPractices: z.boolean().default(true),
  }).default({}),
  severityThresholds: z.object({
    critical: z.boolean().default(true),
    high: z.boolean().default(true),
    medium: z.boolean().default(true),
    low: z.boolean().default(false),
  }).default({}),
  claudeModel: z.string().default('claude-sonnet-4-6'),
  maxTokens: z.number().default(8000),
  codingStandards: z.object({
    enabled: z.boolean().default(false),
    paradigm: z.string().optional(),
    rules: z.array(z.string()).default([]),
    languageRules: z.record(z.string(), z.array(z.string())).default({}),
  }).default({}),
});

export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;

// GitHub types
export interface GitHubContext {
  repository: string;
  owner: string;
  pullNumber: number;
  token: string;
}

export interface PullRequestData {
  title: string;
  description: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  changedFiles: ChangedFile[];
  additions: number;
  deletions: number;
}

export interface ChangedFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
  content?: string;
  language?: string;
}

// Code analysis types
export interface CodeChange {
  file: string;
  language: string;
  changes: FileChange[];
}

export interface FileChange {
  lineNumber: number;
  type: 'addition' | 'deletion' | 'modification';
  content: string;
  context: string[]; // Surrounding lines for context
}

export interface AnalyzedCode {
  files: CodeChange[];
  totalLines: number;
  languages: string[];
  summary: string;
}

// Review types
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ReviewIssue {
  severity: Severity;
  file: string;
  line?: number;
  title: string;
  description: string;
  suggestion?: string;
  category: 'security' | 'bug' | 'quality' | 'performance' | 'best-practice' | 'coding-standards';
}

export interface ReviewResult {
  issues: ReviewIssue[];
  summary: string;
  overallAssessment: 'approve' | 'request_changes' | 'comment';
  positiveFindings: string[];
}

// Claude API types
export interface ClaudeReviewRequest {
  code: AnalyzedCode;
  prContext: {
    title: string;
    description: string;
    author: string;
  };
  config: ReviewConfig;
}

export interface ClaudeReviewResponse {
  issues: ReviewIssue[];
  summary: string;
  positiveFindings: string[];
}

// Environment variables schema
export const EnvSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  GITHUB_REPOSITORY: z.string().optional(),
  GITHUB_EVENT_PATH: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

// Error types
export class ReviewBotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'ReviewBotError';
  }
}

export class GitHubAPIError extends ReviewBotError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'GITHUB_API_ERROR', originalError);
    this.name = 'GitHubAPIError';
  }
}

export class ClaudeAPIError extends ReviewBotError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'CLAUDE_API_ERROR', originalError);
    this.name = 'ClaudeAPIError';
  }
}

export class ConfigError extends ReviewBotError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'CONFIG_ERROR', originalError);
    this.name = 'ConfigError';
  }
}
