/**
 * Sends notifications to Slack and/or Microsoft Teams via webhooks
 * when CodeSentinel finds issues worth flagging.
 */

import { ReviewResult, ReviewIssue } from './types.js';

interface NotificationPayload {
  repoName: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  prUrl: string;
  result: ReviewResult;
}

export class Notifier {
  private slackWebhookUrl: string | undefined;
  private teamsWebhookUrl: string | undefined;

  constructor(slackWebhookUrl?: string, teamsWebhookUrl?: string) {
    this.slackWebhookUrl = slackWebhookUrl;
    this.teamsWebhookUrl = teamsWebhookUrl;
  }

  get isEnabled(): boolean {
    return !!(this.slackWebhookUrl || this.teamsWebhookUrl);
  }

  /**
   * Sends notifications if critical, high, or security issues were found.
   */
  async notify(payload: NotificationPayload): Promise<void> {
    const { result } = payload;

    const critical = result.issues.filter(i => i.severity === 'critical');
    const high = result.issues.filter(i => i.severity === 'high');
    const security = result.issues.filter(i => i.category === 'security');

    // Only notify if there are significant issues
    if (critical.length === 0 && high.length === 0 && security.length === 0) {
      return;
    }

    const promises: Promise<void>[] = [];

    if (this.slackWebhookUrl) {
      promises.push(this.sendSlack(payload, critical, high, security));
    }

    if (this.teamsWebhookUrl) {
      promises.push(this.sendTeams(payload, critical, high, security));
    }

    await Promise.allSettled(promises);
  }

  private async sendSlack(
    payload: NotificationPayload,
    critical: ReviewIssue[],
    high: ReviewIssue[],
    security: ReviewIssue[]
  ): Promise<void> {
    const emoji = critical.length > 0 ? '🚨' : '⚠️';
    const severity = critical.length > 0 ? 'CRITICAL' : 'HIGH';

    const issueLines: string[] = [];
    for (const issue of [...critical, ...high]) {
      issueLines.push(`• *[${issue.severity.toUpperCase()}]* ${issue.title} — \`${issue.file}\``);
    }

    const slackPayload = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} CodeSentinel: ${severity} issues found`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Repository:*\n${payload.repoName}` },
            { type: 'mrkdwn', text: `*PR:*\n<${payload.prUrl}|#${payload.prNumber}>` },
            { type: 'mrkdwn', text: `*Author:*\n${payload.prAuthor}` },
            { type: 'mrkdwn', text: `*Assessment:*\n${payload.result.overallAssessment}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${payload.prTitle}*\n\n` +
              `Found: ${critical.length} critical, ${high.length} high, ${security.length} security issues\n\n` +
              issueLines.slice(0, 5).join('\n'),
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View PR' },
              url: payload.prUrl,
              style: critical.length > 0 ? 'danger' : 'primary',
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(this.slackWebhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        console.warn(`Slack notification failed: ${response.status}`);
      } else {
        console.log('Slack notification sent successfully');
      }
    } catch (error) {
      console.warn('Failed to send Slack notification:', (error as Error).message);
    }
  }

  private async sendTeams(
    payload: NotificationPayload,
    critical: ReviewIssue[],
    high: ReviewIssue[],
    security: ReviewIssue[]
  ): Promise<void> {
    const color = critical.length > 0 ? 'attention' : 'warning';
    const severity = critical.length > 0 ? 'CRITICAL' : 'HIGH';

    const issueFacts = [...critical, ...high].slice(0, 5).map(issue => ({
      title: `${issue.severity.toUpperCase()} — ${issue.file}`,
      value: issue.title,
    }));

    const teamsPayload = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              {
                type: 'TextBlock',
                size: 'Large',
                weight: 'Bolder',
                text: `🛡️ CodeSentinel: ${severity} issues found`,
                style: color,
              },
              {
                type: 'FactSet',
                facts: [
                  { title: 'Repository', value: payload.repoName },
                  { title: 'PR', value: `#${payload.prNumber} — ${payload.prTitle}` },
                  { title: 'Author', value: payload.prAuthor },
                  { title: 'Assessment', value: payload.result.overallAssessment },
                  { title: 'Critical', value: String(critical.length) },
                  { title: 'High', value: String(high.length) },
                  { title: 'Security', value: String(security.length) },
                ],
              },
              {
                type: 'TextBlock',
                text: '**Issues:**',
                weight: 'Bolder',
                spacing: 'Medium',
              },
              ...issueFacts.map(f => ({
                type: 'TextBlock',
                text: `⚠️ **[${f.title}]** ${f.value}`,
                wrap: true,
              })),
            ],
            actions: [
              {
                type: 'Action.OpenUrl',
                title: 'View Pull Request',
                url: payload.prUrl,
              },
            ],
          },
        },
      ],
    };

    try {
      const response = await fetch(this.teamsWebhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamsPayload),
      });

      if (!response.ok) {
        console.warn(`Teams notification failed: ${response.status}`);
      } else {
        console.log('Teams notification sent successfully');
      }
    } catch (error) {
      console.warn('Failed to send Teams notification:', (error as Error).message);
    }
  }
}
