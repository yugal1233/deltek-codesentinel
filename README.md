# AI Code Review Bot

An intelligent, AI-powered code review bot that automatically reviews pull requests using Claude AI. Built with TypeScript and GitHub Actions, this bot provides comprehensive code analysis focusing on security, bugs, code quality, performance, and best practices.

## Features

- **AI-Powered Reviews**: Leverages Anthropic's Claude AI for intelligent code analysis
- **Comprehensive Analysis**: Reviews code for:
  - Security vulnerabilities (SQL injection, XSS, authentication issues, etc.)
  - Potential bugs and logic errors
  - Code quality and maintainability
  - Performance issues
  - Best practices across multiple languages
- **Multi-Language Support**: Works with JavaScript, TypeScript, Python, Java, Go, Rust, and more
- **Automatic Triggers**: Runs automatically on pull requests targeting main branch
- **Actionable Feedback**: Provides specific suggestions and inline comments
- **Configurable**: Customizable review criteria and thresholds
- **GitHub Integration**: Seamless integration with GitHub pull requests

## Prerequisites

- Node.js 18 or higher
- GitHub repository with Actions enabled
- Anthropic API key ([Get one here](https://console.anthropic.com/))
- GitHub Personal Access Token (for local testing only)

## Installation

### 1. Clone or Copy This Repository

If you want to use this bot in your own repository:

```bash
# Option 1: Copy files to your repository
cp -r .github/workflows/code-review.yml your-repo/.github/workflows/

# Option 2: Use as a standalone repository
git clone <this-repo-url> code-review-bot
cd code-review-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Project

```bash
npm run build
```

## Testing Before Deployment

**⚠️ IMPORTANT: Test the bot locally before deploying to production!**

### Quick Test (Recommended)

The fastest way to test the bot:

```bash
# Windows
quick-test.bat

# Linux/Mac
bash quick-test.sh
```

Or manually:

```bash
# 1. Set up your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 2. Run the test
npm test
```

This will test the bot against sample code files with intentional issues. You should see the bot identify:
- 3-4 SQL injection vulnerabilities
- Security issues with `eval()` and password handling
- Bugs like division by zero and null pointer exceptions
- Performance issues like N+1 queries

**Expected cost**: ~$0.02-$0.05 per test

See [TESTING.md](TESTING.md) for detailed testing instructions, including how to test with your own code or a real PR.

## Configuration

### Setting Up GitHub Actions

1. **Add the Anthropic API Key to GitHub Secrets**:
   - Go to your repository on GitHub
   - Navigate to `Settings` > `Secrets and variables` > `Actions`
   - Click `New repository secret`
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your Anthropic API key
   - Click `Add secret`

2. **Copy the Workflow File** (if not already in your repo):
   - Copy `.github/workflows/code-review.yml` to your repository
   - Commit and push the file

3. **Configure Branch Protection** (optional but recommended):
   - Go to `Settings` > `Branches`
   - Add rule for `main` branch
   - Enable "Require status checks to pass before merging"
   - Select the "AI Code Review" check

### Customizing Review Settings

Edit `config/review-config.json` to customize the bot's behavior:

```json
{
  "maxPRSize": 500,              // Maximum lines changed before warning
  "excludedFiles": [             // Files/patterns to skip
    "package-lock.json",
    "*.min.js",
    "dist/**"
  ],
  "reviewFocusAreas": {          // What to review
    "security": true,
    "bugs": true,
    "codeQuality": true,
    "performance": true,
    "bestPractices": true
  },
  "severityThresholds": {        // What severity blocks PRs
    "critical": true,            // Block on critical issues
    "high": true,                // Block on high issues
    "medium": true,              // Block on medium issues
    "low": false                 // Don't block on low issues
  },
  "claudeModel": "claude-sonnet-4-5-20250929",  // Claude model to use
  "maxTokens": 8000              // Max tokens for response
}
```

### Model Options

You can use different Claude models based on your needs:

- `claude-sonnet-4-5-20250929` - Balanced performance and cost (recommended)
- `claude-opus-4-5-20251101` - Highest quality, higher cost
- `claude-3-5-sonnet-20241022` - Previous generation, lower cost

Update the `claudeModel` field in `config/review-config.json` to change models.

## Usage

### Automatic Reviews

Once set up, the bot automatically reviews pull requests:

1. Create a pull request targeting the `main` branch
2. The bot triggers automatically
3. Wait for the review to complete (usually 1-2 minutes)
4. View the review comments on your PR

### Local Testing

To test the bot locally:

1. **Create a `.env` file**:
   ```bash
   cp .env.example .env
   ```

2. **Fill in your credentials**:
   ```env
   GITHUB_TOKEN=ghp_your_token_here
   ANTHROPIC_API_KEY=sk-ant-your_key_here
   GITHUB_REPOSITORY=owner/repo
   PR_NUMBER=123
   ```

3. **Run the bot**:
   ```bash
   npm run dev
   ```

## How It Works

1. **Trigger**: GitHub Actions workflow triggers on PR events
2. **Fetch**: Bot fetches PR details and changed files
3. **Analyze**: Code analyzer processes changes and filters relevant files
4. **Review**: Claude AI reviews the code comprehensively
5. **Report**: Bot posts review comments and inline suggestions
6. **Label**: Automatically adds labels based on severity

### Review Output Example

The bot provides:
- **Summary comment** with overall assessment
- **Inline comments** on specific lines with issues
- **Severity ratings** (Critical, High, Medium, Low)
- **Categories** (Security, Bug, Quality, Performance, Best Practice)
- **Actionable suggestions** for each issue
- **Positive findings** highlighting good practices

## Cost Estimation

The bot uses the Anthropic Claude API, which charges based on tokens:

- **Small PR** (< 100 lines): ~$0.01 - $0.05 per review
- **Medium PR** (100-300 lines): ~$0.05 - $0.15 per review
- **Large PR** (300-500 lines): ~$0.15 - $0.30 per review

Costs may vary based on:
- Code complexity
- Number of languages
- Selected Claude model
- Amount of context needed

**Tip**: Set `maxPRSize` in config to limit review costs for very large PRs.

## Troubleshooting

### Bot Not Triggering

- Check that the workflow file is in `.github/workflows/`
- Verify the PR targets the `main` branch
- Ensure GitHub Actions is enabled for your repository
- Check Actions tab for workflow runs and errors

### Review Fails

- Verify `ANTHROPIC_API_KEY` secret is set correctly
- Check API key has sufficient credits
- Review GitHub Actions logs for detailed error messages
- Ensure the repository is accessible with `GITHUB_TOKEN`

### Bot Comments Not Appearing

- Verify workflow has `pull-requests: write` permission
- Check that the bot completed successfully in Actions tab
- Ensure no branch protection rules block bot comments

### API Rate Limits

- Anthropic: Check your API usage at console.anthropic.com
- GitHub: Actions have rate limits; check Actions tab for details

## Development

### Project Structure

```
code-review-bot/
├── .github/workflows/
│   └── code-review.yml       # GitHub Actions workflow
├── src/
│   ├── index.ts              # Main entry point
│   ├── reviewEngine.ts       # Core review orchestration
│   ├── claudeClient.ts       # Claude API integration
│   ├── githubClient.ts       # GitHub API integration
│   ├── codeAnalyzer.ts       # Code parsing and analysis
│   └── types.ts              # TypeScript type definitions
├── config/
│   └── review-config.json    # Configuration file
├── package.json
├── tsconfig.json
└── README.md
```

### Building

```bash
# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Lint code
npm run lint
```

### Running Tests

```bash
npm test
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Security

- Never commit API keys or tokens
- Store secrets in GitHub Secrets
- Use environment variables for sensitive data
- Review the code before deployment

## License

MIT License - See LICENSE file for details

## Support

- Issues: [GitHub Issues](https://github.com/your-repo/issues)
- Documentation: This README
- Anthropic API: [Documentation](https://docs.anthropic.com/)
- GitHub Actions: [Documentation](https://docs.github.com/actions)

## Acknowledgments

- Built with [Anthropic Claude](https://www.anthropic.com/)
- Powered by [GitHub Actions](https://github.com/features/actions)
- Uses [Octokit](https://github.com/octokit) for GitHub API

---

Made with by the AI Code Review Bot team
