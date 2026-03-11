import { Octokit } from '@octokit/rest';
import {
  GitHubContext,
  PullRequestData,
  ChangedFile,
  ReviewResult,
  GitHubAPIError,
} from './types';
import {
  formatReviewComment,
  formatInlineComment,
} from './reviewFormatter';

export class GitHubClient {
  private octokit: Octokit;
  private context: GitHubContext;

  constructor(context: GitHubContext) {
    this.context = context;
    this.octokit = new Octokit({
      auth: context.token,
      userAgent: 'deltek-codesentinel/1.0.0',
    });
  }

  /**
   * Fetches pull request data including changed files and diffs
   */
  async fetchPullRequestData(): Promise<PullRequestData> {
    try {
      console.log(`Fetching PR #${this.context.pullNumber} data...`);

      // Get PR details
      const { data: pr } = await this.octokit.pulls.get({
        owner: this.context.owner,
        repo: this.context.repository,
        pull_number: this.context.pullNumber,
      });

      // Get changed files
      const { data: files } = await this.octokit.pulls.listFiles({
        owner: this.context.owner,
        repo: this.context.repository,
        pull_number: this.context.pullNumber,
        per_page: 100,
      });

      const changedFiles: ChangedFile[] = await Promise.all(
        files.map(async (file) => {
          const changedFile: ChangedFile = {
            filename: file.filename,
            status: file.status as ChangedFile['status'],
            additions: file.additions,
            deletions: file.deletions,
            patch: file.patch,
          };

          // Fetch full file content for context
          if (file.status !== 'removed') {
            try {
              const { data: content } = await this.octokit.repos.getContent({
                owner: this.context.owner,
                repo: this.context.repository,
                path: file.filename,
                ref: pr.head.sha,
              });

              if ('content' in content && content.content) {
                changedFile.content = Buffer.from(
                  content.content,
                  'base64'
                ).toString('utf-8');
              }
            } catch (error) {
              console.warn(`Could not fetch content for ${file.filename}:`, error);
            }
          }

          return changedFile;
        })
      );

      return {
        title: pr.title,
        description: pr.body || '',
        author: pr.user?.login || 'unknown',
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        changedFiles,
        additions: pr.additions,
        deletions: pr.deletions,
      };
    } catch (error) {
      throw new GitHubAPIError(
        `Failed to fetch pull request data: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Posts a review comment on the pull request
   */
  async postReview(reviewResult: ReviewResult): Promise<void> {
    try {
      console.log('Posting review to GitHub...');

      const body = formatReviewComment(reviewResult);

      // Determine review event based on overall assessment
      let event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'COMMENT';
      if (reviewResult.overallAssessment === 'approve') {
        event = 'APPROVE';
      } else if (reviewResult.overallAssessment === 'request_changes') {
        event = 'REQUEST_CHANGES';
      }

      // Create inline comments for specific issues
      const comments = reviewResult.issues
        .filter((issue) => issue.line !== undefined)
        .map((issue) => ({
          path: issue.file,
          line: issue.line!,
          body: formatInlineComment(issue),
        }));

      // Post the review
      await this.octokit.pulls.createReview({
        owner: this.context.owner,
        repo: this.context.repository,
        pull_number: this.context.pullNumber,
        event,
        body,
        comments: comments.length > 0 ? comments : undefined,
      });

      console.log(`Review posted successfully with status: ${event}`);
    } catch (error) {
      throw new GitHubAPIError(
        `Failed to post review: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Posts a simple comment on the pull request
   */
  async postComment(message: string): Promise<void> {
    try {
      await this.octokit.issues.createComment({
        owner: this.context.owner,
        repo: this.context.repository,
        issue_number: this.context.pullNumber,
        body: message,
      });
      console.log('Comment posted successfully');
    } catch (error) {
      throw new GitHubAPIError(
        `Failed to post comment: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Adds a label to the pull request
   */
  async addLabel(label: string): Promise<void> {
    try {
      await this.octokit.issues.addLabels({
        owner: this.context.owner,
        repo: this.context.repository,
        issue_number: this.context.pullNumber,
        labels: [label],
      });
      console.log(`Label '${label}' added to PR`);
    } catch (error) {
      console.warn(`Failed to add label '${label}':`, error);
    }
  }
}
