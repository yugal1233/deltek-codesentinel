import { ReviewResult, ReviewIssue } from './types';

/**
 * Shared formatting logic for review output.
 * Used by both GitHubClient (for PR comments) and TestRunner (for local preview).
 */

/**
 * Gets emoji for severity level
 */
export function getSeverityEmoji(severity: string): string {
  const emojis: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
    info: '💡',
  };
  return emojis[severity] || '📝';
}

/**
 * Formats a single issue for the main review comment
 */
export function formatIssue(issue: ReviewIssue): string {
  let formatted = `\n**${issue.title}**\n`;
  formatted += `- **File**: \`${issue.file}\``;
  if (issue.line) {
    formatted += ` (Line ${issue.line})`;
  }
  formatted += `\n`;
  formatted += `- **Category**: ${issue.category}\n`;
  formatted += `- **Description**: ${issue.description}\n`;
  if (issue.suggestion) {
    formatted += `- **Suggestion**: ${issue.suggestion}\n`;
  }
  formatted += '\n';
  return formatted;
}

/**
 * Formats the main review comment (posted as the PR review body)
 */
export function formatReviewComment(reviewResult: ReviewResult): string {
  let comment = '## 🛡️ Deltek CodeSentinel Review\n\n';

  // Summary
  comment += `### Summary\n${reviewResult.summary}\n\n`;

  // Issues by severity
  const criticalIssues = reviewResult.issues.filter((i) => i.severity === 'critical');
  const highIssues = reviewResult.issues.filter((i) => i.severity === 'high');
  const mediumIssues = reviewResult.issues.filter((i) => i.severity === 'medium');
  const lowIssues = reviewResult.issues.filter((i) => i.severity === 'low');

  if (reviewResult.issues.length > 0) {
    comment += '### Issues Found\n\n';

    if (criticalIssues.length > 0) {
      comment += `#### 🔴 Critical (${criticalIssues.length})\n`;
      criticalIssues.forEach((issue) => {
        comment += formatIssue(issue);
      });
    }

    if (highIssues.length > 0) {
      comment += `#### 🟠 High (${highIssues.length})\n`;
      highIssues.forEach((issue) => {
        comment += formatIssue(issue);
      });
    }

    if (mediumIssues.length > 0) {
      comment += `#### 🟡 Medium (${mediumIssues.length})\n`;
      mediumIssues.forEach((issue) => {
        comment += formatIssue(issue);
      });
    }

    if (lowIssues.length > 0) {
      comment += `#### 🔵 Low (${lowIssues.length})\n`;
      lowIssues.forEach((issue) => {
        comment += formatIssue(issue);
      });
    }
  }

  // Positive findings
  if (reviewResult.positiveFindings.length > 0) {
    comment += '### ✅ Positive Findings\n\n';
    reviewResult.positiveFindings.forEach((finding) => {
      comment += `- ${finding}\n`;
    });
    comment += '\n';
  }

  // Footer
  comment += '\n---\n';
  comment += '*Powered by Deltek CodeSentinel | Claude AI*\n';

  return comment;
}

/**
 * Formats an inline comment for a specific line (posted as PR inline comment)
 */
export function formatInlineComment(issue: ReviewIssue): string {
  let comment = `**${getSeverityEmoji(issue.severity)} ${issue.title}**\n\n`;
  comment += `${issue.description}\n\n`;
  if (issue.suggestion) {
    comment += `**Suggestion:**\n${issue.suggestion}\n\n`;
  }
  comment += `*Category: ${issue.category} | Severity: ${issue.severity}*`;
  return comment;
}
