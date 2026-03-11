import Anthropic from '@anthropic-ai/sdk';
import {
  ClaudeReviewRequest,
  ClaudeReviewResponse,
  ReviewIssue,
  Severity,
  ClaudeAPIError,
} from './types.js';

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  /**
   * Performs AI-powered code review using Claude
   */
  async reviewCode(request: ClaudeReviewRequest): Promise<ClaudeReviewResponse> {
    try {
      console.log(`Requesting code review from Claude (${this.model})...`);

      // Build the prompt
      const prompt = this.buildReviewPrompt(request);

      // Call Claude API
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0.3, // Lower temperature for more consistent reviews
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Parse the response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const reviewResponse = this.parseClaudeResponse(content.text);
      console.log(`Review completed. Found ${reviewResponse.issues.length} issues.`);

      return reviewResponse;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ClaudeAPIError(
          `Claude API error: ${error.message} (${error.status})`,
          error
        );
      }
      throw new ClaudeAPIError(
        `Failed to review code: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Builds the review prompt for Claude
   */
  private buildReviewPrompt(request: ClaudeReviewRequest): string {
    const { code, prContext, config } = request;

    let prompt = `You are an expert code reviewer with deep knowledge of software security, best practices, and common pitfalls across multiple programming languages.

Review the following pull request and provide detailed, actionable feedback.

## Pull Request Context
**Title:** ${prContext.title}
**Author:** ${prContext.author}
**Description:** ${prContext.description || 'No description provided'}

## Review Focus Areas
`;

    if (config.reviewFocusAreas.security) {
      prompt += '- **Security**: Look for vulnerabilities like SQL injection, XSS, authentication issues, insecure data handling, hardcoded secrets, etc.\n';
    }
    if (config.reviewFocusAreas.bugs) {
      prompt += '- **Bugs**: Identify logic errors, null pointer issues, off-by-one errors, race conditions, incorrect error handling, etc.\n';
    }
    if (config.reviewFocusAreas.codeQuality) {
      prompt += '- **Code Quality**: Assess readability, maintainability, proper naming, code organization, and adherence to language idioms.\n';
    }
    if (config.reviewFocusAreas.performance) {
      prompt += '- **Performance**: Find N+1 queries, inefficient algorithms, memory leaks, unnecessary computations, etc.\n';
    }
    if (config.reviewFocusAreas.bestPractices) {
      prompt += '- **Best Practices**: Ensure proper error handling, logging, testing considerations, and following language/framework conventions.\n';
    }

    // Add coding standards section if enabled
    if (config.codingStandards.enabled) {
      prompt += '\n## Coding Standards & Paradigm Enforcement\n\n';
      prompt += '**IMPORTANT:** In addition to the above, strictly check that the code follows these team coding standards. ';
      prompt += 'Flag any violations with category "coding-standards".\n\n';

      if (config.codingStandards.paradigm) {
        prompt += `**Required Paradigm:** ${config.codingStandards.paradigm}\n`;
        prompt += `Verify the code adheres to ${config.codingStandards.paradigm} principles throughout.\n\n`;
      }

      if (config.codingStandards.rules.length > 0) {
        prompt += '**General Rules (apply to all languages):**\n';
        config.codingStandards.rules.forEach((rule, i) => {
          prompt += `${i + 1}. ${rule}\n`;
        });
        prompt += '\n';
      }

      const langRules = config.codingStandards.languageRules;
      const langKeys = Object.keys(langRules);
      if (langKeys.length > 0) {
        prompt += '**Language-Specific Rules:**\n';
        for (const lang of langKeys) {
          prompt += `\n*${lang}:*\n`;
          langRules[lang].forEach((rule, i) => {
            prompt += `${i + 1}. ${rule}\n`;
          });
        }
        prompt += '\n';
      }
    }

    prompt += `\n## Code Changes

${code.summary}

`;

    // Add file changes
    for (const file of code.files) {
      prompt += `### File: ${file.file} (${file.language})\n\n`;

      // Group changes by addition/modification/deletion
      const additions = file.changes.filter((c) => c.type === 'addition');
      const deletions = file.changes.filter((c) => c.type === 'deletion');

      if (additions.length > 0) {
        prompt += '**Added/Modified Lines:**\n```\n';
        additions.forEach((change) => {
          prompt += `Line ${change.lineNumber}: ${change.content}\n`;
        });
        prompt += '```\n\n';
      }

      if (deletions.length > 0 && deletions.length < 20) {
        prompt += '**Removed Lines:**\n```\n';
        deletions.forEach((change) => {
          prompt += `${change.content}\n`;
        });
        prompt += '```\n\n';
      }
    }

    prompt += `\n## Review Instructions

Provide your review in the following JSON format:

\`\`\`json
{
  "issues": [
    {
      "severity": "critical|high|medium|low|info",
      "file": "path/to/file.ext",
      "line": 123,
      "title": "Brief issue title",
      "description": "Detailed explanation of the issue and its impact",
      "suggestion": "Specific code suggestion or fix",
      "category": "security|bug|quality|performance|best-practice|coding-standards"
    }
  ],
  "summary": "Overall assessment of the PR quality and main concerns",
  "positiveFindings": [
    "List of good practices or well-written code found in the PR"
  ]
}
\`\`\`

**Important guidelines:**
1. Only report issues you are confident about - avoid false positives
2. Provide specific, actionable suggestions for each issue
3. Include line numbers when possible
4. Be constructive and professional in your feedback
5. Acknowledge good practices and well-written code
6. Consider the context - not every deviation from ideal is worth mentioning
7. Focus on meaningful issues that impact functionality, security, or maintainability
8. If the code is generally good, say so and highlight what's done well

Respond ONLY with the JSON object, no additional text before or after.`;

    return prompt;
  }

  /**
   * Parses Claude's response into a structured format
   */
  private parseClaudeResponse(response: string): ClaudeReviewResponse {
    try {
      const jsonText = this.extractJson(response);
      // Sanitize unescaped control characters inside JSON string values.
      // Claude sometimes produces literal newlines/tabs inside JSON strings
      // instead of \n / \t escape sequences, which breaks JSON.parse.
      const sanitized = jsonText.replace(
        /"(?:[^"\\]|\\.)*"/g,
        (match) => match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
      );
      const parsed = JSON.parse(sanitized);

      // Validate and transform the response
      const issues: ReviewIssue[] = (parsed.issues || []).map((issue: any) => ({
        severity: this.validateSeverity(issue.severity),
        file: String(issue.file || ''),
        line: issue.line ? Number(issue.line) : undefined,
        title: String(issue.title || 'Untitled Issue'),
        description: String(issue.description || ''),
        suggestion: issue.suggestion ? String(issue.suggestion) : undefined,
        category: this.validateCategory(issue.category),
      }));

      return {
        issues,
        summary: String(parsed.summary || 'No summary provided'),
        positiveFindings: Array.isArray(parsed.positiveFindings)
          ? parsed.positiveFindings.map(String)
          : [],
      };
    } catch (error) {
      console.error('Failed to parse Claude response:', error);
      console.error('Raw response (first 500 chars):', response.substring(0, 500));

      // Return a fallback response
      return {
        issues: [],
        summary:
          'The code review was completed, but there was an error parsing the detailed results. ' +
          'Please review the code manually or try again.',
        positiveFindings: [],
      };
    }
  }

  /**
   * Extracts JSON from Claude's response, handling nested code blocks.
   *
   * Claude often wraps its response in ```json ... ``` but the JSON values
   * themselves may contain markdown code blocks (e.g. in suggestion fields).
   * A simple regex like /```json(.*?)```/ fails because it matches the first
   * inner closing ```. Instead, we find the opening ```json marker and then
   * locate the true closing ``` by finding the last valid JSON object boundary.
   */
  private extractJson(response: string): string {
    const trimmed = response.trim();

    // If the response starts with '{', it's raw JSON — use it directly
    if (trimmed.startsWith('{')) {
      return trimmed;
    }

    // Find the opening ```json marker
    const codeBlockStart = trimmed.indexOf('```json');
    if (codeBlockStart === -1) {
      // No code block — try to find a JSON object directly
      const firstBrace = trimmed.indexOf('{');
      if (firstBrace !== -1) {
        return trimmed.substring(firstBrace);
      }
      return trimmed;
    }

    // Get everything after ```json\n
    const afterMarker = trimmed.substring(codeBlockStart + '```json'.length);
    const jsonStart = afterMarker.indexOf('{');
    if (jsonStart === -1) {
      return afterMarker;
    }

    const content = afterMarker.substring(jsonStart);

    // Find the matching closing brace by tracking brace depth,
    // respecting JSON string boundaries
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return content.substring(0, i + 1);
        }
      }
    }

    // Fallback: return everything (parser will handle errors)
    return content;
  }

  /**
   * Validates and normalizes severity levels
   */
  private validateSeverity(severity: string): Severity {
    const validSeverities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const normalized = severity?.toLowerCase() as Severity;
    return validSeverities.includes(normalized) ? normalized : 'medium';
  }

  /**
   * Validates and normalizes issue categories
   */
  private validateCategory(
    category: string
  ): 'security' | 'bug' | 'quality' | 'performance' | 'best-practice' {
    const validCategories = ['security', 'bug', 'quality', 'performance', 'best-practice', 'coding-standards'];
    const normalized = category?.toLowerCase();
    return validCategories.includes(normalized)
      ? (normalized as any)
      : 'quality';
  }

  /**
   * Estimates token count for the request (rough approximation)
   */
  estimateTokenCount(request: ClaudeReviewRequest): number {
    const prompt = this.buildReviewPrompt(request);
    // Rough estimate: ~4 characters per token
    return Math.ceil(prompt.length / 4);
  }
}
