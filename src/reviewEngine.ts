import { GitHubClient } from './githubClient.js';
import { CodeAnalyzer } from './codeAnalyzer.js';
import { ClaudeClient } from './claudeClient.js';
import {
  ReviewConfig,
  ReviewResult,
  ReviewIssue,
  ClaudeReviewRequest,
} from './types.js';

export class ReviewEngine {
  private githubClient: GitHubClient;
  private codeAnalyzer: CodeAnalyzer;
  private claudeClient: ClaudeClient;
  private config: ReviewConfig;

  constructor(
    githubClient: GitHubClient,
    claudeClient: ClaudeClient,
    codeAnalyzer: CodeAnalyzer,
    config: ReviewConfig
  ) {
    this.githubClient = githubClient;
    this.claudeClient = claudeClient;
    this.codeAnalyzer = codeAnalyzer;
    this.config = config;
  }

  /**
   * Main review orchestration method
   */
  async review(): Promise<'approve' | 'request_changes' | 'comment'> {
    try {
      console.log('Starting code review process...');

      // Step 1: Fetch PR data from GitHub
      const prData = await this.githubClient.fetchPullRequestData();
      console.log(`PR: ${prData.title} by ${prData.author}`);

      // Check if PR is too large
      if (this.codeAnalyzer.isTooLarge(prData)) {
        const message = `## ⚠️ Deltek CodeSentinel - PR Too Large for Automated Review\n\n` +
          `This pull request has ${prData.additions + prData.deletions} lines changed, ` +
          `which exceeds the maximum of ${this.config.maxPRSize} lines.\n\n` +
          `**Recommendation:** Please break this PR into smaller, focused changes for better review quality and easier maintenance.\n\n` +
          `**Tips for splitting PRs:**\n` +
          `- Separate refactoring from feature changes\n` +
          `- Break large features into incremental steps\n` +
          `- Keep each PR focused on a single concern\n\n` +
          `*If you believe this PR should be reviewed as-is, please request a manual review.*`;

        await this.githubClient.postComment(message);
        console.log('Posted PR size warning comment');
        return 'request_changes';
      }

      // Step 2: Analyze the code
      const analyzedCode = this.codeAnalyzer.analyze(prData);

      if (analyzedCode.files.length === 0) {
        await this.githubClient.postComment(
          '## 🛡️ Deltek CodeSentinel Review\n\n' +
          'No significant code changes detected to review. ' +
          'This might be due to configuration changes, binary files, or excluded file patterns.'
        );
        console.log('No code to review, skipping.');
        return 'approve';
      }

      // Step 3: Perform AI review
      const reviewRequest: ClaudeReviewRequest = {
        code: analyzedCode,
        prContext: {
          title: prData.title,
          description: prData.description,
          author: prData.author,
        },
        config: this.config,
      };

      // Estimate token usage
      const estimatedTokens = this.claudeClient.estimateTokenCount(reviewRequest);
      console.log(`Estimated tokens for review: ${estimatedTokens}`);

      // Get AI review
      const claudeResponse = await this.claudeClient.reviewCode(reviewRequest);

      // Step 4: Determine overall assessment
      const overallAssessment = this.determineOverallAssessment(
        claudeResponse.issues,
        this.config
      );

      const reviewResult: ReviewResult = {
        issues: claudeResponse.issues,
        summary: claudeResponse.summary,
        overallAssessment,
        positiveFindings: claudeResponse.positiveFindings,
      };

      // Step 5: Post review to GitHub
      await this.githubClient.postReview(reviewResult);

      // Add labels and request human reviewers based on severity
      const hasCritical = reviewResult.issues.some((i) => i.severity === 'critical');
      const hasHigh = reviewResult.issues.some((i) => i.severity === 'high');
      const hasSecurity = reviewResult.issues.some((i) => i.category === 'security');

      if (hasCritical) {
        await this.githubClient.addLabel('security-review-needed');
        await this.githubClient.addLabel('needs-human-review');
      } else if (hasHigh) {
        await this.githubClient.addLabel('needs-human-review');
      }

      if (hasSecurity) {
        await this.githubClient.addLabel('security');
      }

      // Auto-request human reviewers if configured
      const humanReviewers = process.env.INPUT_HUMAN_REVIEWERS;
      if (humanReviewers && (hasCritical || hasHigh || hasSecurity)) {
        const reviewers = humanReviewers.split(',').map(r => r.trim()).filter(Boolean);
        if (reviewers.length > 0) {
          await this.githubClient.requestReviewers(reviewers);
        }
      }

      console.log(`Review completed successfully! Assessment: ${overallAssessment}`);
      return overallAssessment;
    } catch (error) {
      // Log the error
      console.error('Review failed:', error);

      // Post error message to PR
      await this.postErrorComment(error as Error);

      throw error;
    }
  }

  /**
   * Determines overall assessment based on issues found
   */
  private determineOverallAssessment(
    issues: ReviewIssue[],
    config: ReviewConfig
  ): 'approve' | 'request_changes' | 'comment' {
    const hasCritical = issues.some((i) => i.severity === 'critical');

    // Only block merges for critical issues (crashes, data loss, exploitable vulnerabilities)
    if (config.severityThresholds.critical && hasCritical) {
      return 'request_changes';
    }

    // Approve if no issues, or only low/info/medium issues
    if (issues.length === 0 || issues.every((i) =>
      i.severity === 'low' || i.severity === 'info' || i.severity === 'medium'
    )) {
      return 'approve';
    }

    // High issues get a comment but don't block
    return 'comment';
  }

  /**
   * Posts an error message to the PR when review fails
   */
  private async postErrorComment(error: Error): Promise<void> {
    try {
      const message = `## ⚠️ Deltek CodeSentinel - Review Failed\n\n` +
        `The automated code review encountered an error and could not complete.\n\n` +
        `**Error:** ${error.message}\n\n` +
        `This is likely a temporary issue. Please try one of the following:\n` +
        `- Re-run the workflow\n` +
        `- Check the GitHub Actions logs for more details\n` +
        `- Request a manual code review\n\n` +
        `If this issue persists, please contact the repository maintainers.`;

      await this.githubClient.postComment(message);
    } catch (commentError) {
      console.error('Failed to post error comment:', commentError);
    }
  }
}
