# Deltek CodeSentinel

An AI-powered code review bot that automatically reviews GitHub pull requests using Anthropic's Claude API. Built by the **CIE Team (Centralized Integration Engineering Team)** at Deltek.

CodeSentinel integrates seamlessly into any repository as a reusable GitHub Action, providing comprehensive code analysis for security vulnerabilities, bugs, code quality, performance, and best practices.

## Features

- **AI-Powered Reviews** — Leverages Anthropic's Claude AI for intelligent, context-aware code analysis
- **Reusable GitHub Action** — Add to any repository with just a few lines of YAML
- **Merge Gating** — Blocks merges when critical or high severity issues are found
- **Multi-Language Support** — Works with JavaScript, TypeScript, Python, Java, Go, Rust, and more
- **PR Summary** — Generates a TL;DR summary of what the PR does
- **Auto-Fix Suggestions** — Provides code fix suggestions for critical and high severity issues
- **Slack & Teams Notifications** — Sends alerts when critical, high, or security issues are detected
- **Human Reviewer Requests** — Automatically requests human reviewers when serious issues are found
- **Auto-Labeling** — Adds labels like `security-review-needed` and `needs-human-review`
- **Configurable** — Customizable review focus areas, severity thresholds, and coding standards
- **Coding Standards Enforcement** — Optional paradigm and rule-based coding standards checking

## Quick Start

### 1. Add the Workflow

Create `.github/workflows/codesentinel.yml` in your repository:

```yaml
name: Deltek CodeSentinel

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    name: CodeSentinel Review
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run CodeSentinel
        uses: yugal1233/deltek-codesentinel@main
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 2. Add Your API Key

1. Go to your repository on GitHub
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Name: `ANTHROPIC_API_KEY`
5. Value: Your Anthropic API key ([Get one here](https://console.anthropic.com/))

### 3. Create a Pull Request

That's it! CodeSentinel will automatically review any PR targeting the `main` branch.

## Configuration

### Action Inputs

All inputs are optional except `anthropic_api_key`:

| Input | Description | Default |
|-------|-------------|---------|
| `anthropic_api_key` | Anthropic API key for Claude | *required* |
| `model` | Claude model to use | `claude-sonnet-4-6` |
| `max_tokens` | Maximum tokens for Claude response | `8000` |
| `max_pr_size` | Maximum PR size (lines changed) before skipping review | `500` |
| `review_focus` | Comma-separated focus areas | `security,bugs,codeQuality,performance` |
| `block_on` | Comma-separated severities that block merges | `critical` |
| `human_reviewers` | GitHub usernames to auto-request for review | `` |
| `slack_webhook` | Slack webhook URL for notifications | `` |
| `teams_webhook` | Microsoft Teams webhook URL for notifications | `` |
| `pr_summary` | Generate a TL;DR summary comment | `false` |
| `auto_fix` | Generate auto-fix suggestions | `false` |
| `excluded_files` | Comma-separated glob patterns to exclude | `` |
| `coding_standards_enabled` | Enable coding standards checking | `false` |
| `coding_standards_paradigm` | Coding paradigm to enforce | `` |
| `coding_standards_rules` | Pipe-separated coding standard rules | `` |
| `config_path` | Path to a `review-config.json` in the target repo | `` |

### Full Configuration Example

```yaml
- name: Run CodeSentinel
  uses: yugal1233/deltek-codesentinel@main
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    model: 'claude-sonnet-4-6'
    max_tokens: '8000'
    max_pr_size: '500'
    review_focus: 'security,bugs,codeQuality,performance'
    block_on: 'critical,high'
    human_reviewers: 'dev1,dev2'
    slack_webhook: ${{ secrets.SLACK_WEBHOOK }}
    teams_webhook: ${{ secrets.TEAMS_WEBHOOK }}
    pr_summary: 'true'
    auto_fix: 'true'
    excluded_files: '*.test.js,docs/**'
    coding_standards_enabled: 'true'
    coding_standards_paradigm: 'OOP with SOLID principles'
    coding_standards_rules: 'No magic numbers|Use meaningful variable names|Max function length 50 lines'
```

### Config File

You can also place a `review-config.json` in your repository and point to it with the `config_path` input. Action inputs take priority over the config file.

## How It Works

1. **Trigger** — GitHub Actions workflow triggers on PR events (opened, synchronize, reopened)
2. **Fetch** — Fetches PR details and changed files from GitHub
3. **Analyze** — Filters and processes relevant code changes
4. **Summarize** — Generates a TL;DR summary of the PR (if enabled)
5. **Review** — Claude AI reviews the code for issues based on configured focus areas
6. **Auto-Fix** — Generates fix suggestions for critical/high issues (if enabled)
7. **Report** — Posts review comments, inline suggestions, and severity ratings on the PR
8. **Gate** — Blocks the merge if issues exceed the configured severity threshold
9. **Label** — Adds labels (`security`, `needs-human-review`, `security-review-needed`)
10. **Notify** — Sends Slack/Teams notifications and requests human reviewers when needed

## Severity Levels

| Severity | Description | Example |
|----------|-------------|---------|
| **Critical** | Will cause a crash, data loss, or directly exploitable vulnerability | SQL injection, hardcoded credentials, command injection |
| **High** | Real bugs that produce wrong behavior or confirmed vulnerabilities | Unvalidated user input, race conditions |
| **Medium** | Code quality issues that could lead to problems | Missing error handling, poor naming |
| **Low** | Minor improvements and suggestions | Style issues, minor optimizations |

## Branch Protection (Recommended)

To enforce CodeSentinel reviews before merging:

1. Go to **Settings** > **Branches** > **Add branch protection rule**
2. Branch name pattern: `main`
3. Enable **Require status checks to pass before merging**
4. Select **CodeSentinel Review** as a required check
5. Enable **Require approvals** and set the number of required reviewers
6. Enable **Require review from Code Owners** (optional)

## Notifications

### Slack

1. Create an [Incoming Webhook](https://api.slack.com/messaging/webhooks) in your Slack workspace
2. Add the webhook URL as a repository secret (`SLACK_WEBHOOK`)
3. Pass it via the `slack_webhook` input

### Microsoft Teams

1. Create an Incoming Webhook connector in your Teams channel
2. Add the webhook URL as a repository secret (`TEAMS_WEBHOOK`)
3. Pass it via the `teams_webhook` input

Notifications are sent when **critical**, **high**, or **security** issues are detected.

## Cost Estimation

CodeSentinel uses the Anthropic Claude API, which charges based on tokens:

| PR Size | Estimated Cost |
|---------|---------------|
| Small (< 100 lines) | ~$0.01 - $0.05 |
| Medium (100-300 lines) | ~$0.05 - $0.15 |
| Large (300-500 lines) | ~$0.15 - $0.30 |

**Tip**: Set `max_pr_size` to limit review costs for very large PRs.

## Project Structure

```
deltek-codesentinel/
├── action.yml                  # GitHub Action definition
├── src/
│   ├── index.ts                # Entry point and configuration loading
│   ├── reviewEngine.ts         # Core review orchestration
│   ├── claudeClient.ts         # Claude API integration
│   ├── githubClient.ts         # GitHub API integration
│   ├── codeAnalyzer.ts         # Code parsing and analysis
│   ├── notifier.ts             # Slack & Teams notifications
│   └── types.ts                # TypeScript type definitions
├── config/
│   └── review-config.json      # Default configuration
├── examples/
│   ├── basic-workflow.yml      # Minimal usage example
│   └── advanced-workflow.yml   # Full configuration example
├── package.json
├── tsconfig.json
└── README.md
```

## Local Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally (requires .env file)
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

For local testing, create a `.env` file:

```env
GITHUB_TOKEN=ghp_your_token_here
ANTHROPIC_API_KEY=sk-ant-your_key_here
GITHUB_REPOSITORY=owner/repo
PR_NUMBER=123
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot not triggering | Ensure the workflow file is in `.github/workflows/` and the PR targets `main` |
| Review fails | Verify `ANTHROPIC_API_KEY` is set correctly and has sufficient credits |
| Comments not appearing | Ensure workflow has `pull-requests: write` permission |
| Bot approves but merge still blocked | Check branch protection requires additional human reviewers |
| "Not permitted to approve" error | Enable **Allow GitHub Actions to create and approve pull requests** in repo Settings > Actions > General |

## Security

- Never commit API keys or tokens to your repository
- Store all secrets in GitHub Secrets
- CodeSentinel only reads PR diffs — it does not modify your code
- Review the action source code before use

## License

MIT License - See [LICENSE](LICENSE) file for details.

---

Built with [Anthropic Claude](https://www.anthropic.com/) | Powered by [GitHub Actions](https://github.com/features/actions)

Created by the **CIE Team (Centralized Integration Engineering Team)** at **Deltek**
