# Testing Guide

This guide explains how to test the AI Code Review Bot locally before deploying it to your repository.

## Quick Start Testing

### Option 1: Automated Test (Recommended)

The easiest way to test the bot is using the built-in test runner with sample code files:

```bash
# 1. Install dependencies
npm install

# 2. Set up your Anthropic API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# 3. Run the test
npm test
```

This will:
- Load sample code files with intentional issues
- Run the Claude AI review
- Display detailed results in your terminal
- Validate that all components work correctly

**Expected Output**: You should see the bot identify multiple security issues, bugs, and performance problems in the test files.

### Option 2: Test with a Real PR

To test against an actual pull request:

```bash
# 1. Set up environment variables
cp .env.example .env

# 2. Edit .env with:
GITHUB_TOKEN=your_github_token
ANTHROPIC_API_KEY=your_anthropic_key
GITHUB_REPOSITORY=owner/repo
PR_NUMBER=123

# 3. Run the bot
npm run dev
```

## Test Files Provided

The repository includes sample code files with intentional issues for testing:

### `test/sample-code/vulnerable-auth.js`
Contains:
- **Security**: SQL injection vulnerabilities
- **Security**: Storing passwords in sessions
- **Security**: Missing authentication checks
- **Bugs**: Null pointer exceptions
- **Performance**: N+1 query problem

### `test/sample-code/buggy-calculator.py`
Contains:
- **Bugs**: Division by zero not handled
- **Bugs**: Off-by-one errors
- **Bugs**: Mutable default arguments
- **Security**: Use of `eval()`
- **Performance**: Inefficient prime number check
- **Quality**: Poor naming and missing docstrings

## Adding Your Own Test Files

To test with your own code:

1. Add your files to `test/sample-code/` directory
2. Run `npm test`
3. The bot will analyze all files in that directory

```bash
# Example: Add a new test file
echo "your code here" > test/sample-code/my-test.js
npm test
```

## What the Test Validates

The test runner validates:

✅ **Environment Setup**
- Anthropic API key is valid
- Configuration loads correctly

✅ **Code Analysis**
- File parsing works
- Language detection is accurate
- Code changes are extracted properly

✅ **AI Integration**
- Claude API connection succeeds
- Prompts are constructed correctly
- Responses are parsed successfully

✅ **Issue Detection**
- Security vulnerabilities are found
- Bugs and logic errors are identified
- Performance issues are detected
- Code quality problems are recognized

## Understanding Test Results

### Severity Levels

The bot categorizes issues by severity:

- 🔴 **Critical**: Serious security vulnerabilities or data loss risks
- 🟠 **High**: Significant bugs or security issues
- 🟡 **Medium**: Moderate quality or performance issues
- 🔵 **Low**: Minor improvements or style suggestions

### Issue Categories

- **security**: Security vulnerabilities
- **bug**: Logic errors and bugs
- **quality**: Code quality and maintainability
- **performance**: Performance problems
- **best-practice**: Violations of best practices

### Expected Results

For the provided test files, you should see:

**Critical/High Issues**:
- SQL injection vulnerabilities (3-4 instances)
- Use of `eval()` for arbitrary code execution
- Missing authentication checks

**Medium Issues**:
- Null pointer exceptions
- N+1 query problems
- Division by zero
- Mutable default arguments

**Low Issues**:
- Missing docstrings
- Poor variable naming

If the bot finds these issues, it's working correctly!

## Testing Different Scenarios

### Test 1: Security-Focused Review

Create a file with security issues:

```javascript
// test/sample-code/security-test.js
const express = require('express');
app.get('/user', (req, res) => {
  const query = `SELECT * FROM users WHERE id = ${req.query.id}`; // SQL injection
  res.send(eval(req.query.code)); // Code injection
});
```

Run `npm test` and verify security issues are detected.

### Test 2: Bug Detection

Create a file with bugs:

```python
# test/sample-code/bug-test.py
def divide_numbers(a, b):
    return a / b  # Missing zero check

def get_user_name(user):
    return user.name  # Missing null check
```

Run `npm test` and verify bugs are detected.

### Test 3: Performance Review

Create a file with performance issues:

```javascript
// test/sample-code/performance-test.js
function findUsers(ids) {
  return ids.map(id => {
    return database.query(`SELECT * FROM users WHERE id = ${id}`); // N+1
  });
}
```

Run `npm test` and verify performance issues are detected.

## Troubleshooting Tests

### "ANTHROPIC_API_KEY is not set"

**Solution**:
```bash
cp .env.example .env
# Edit .env and add your API key
```

### "Test directory not found"

**Solution**: Ensure you're in the project root:
```bash
cd C:/Workspaces/code-review-bot
npm test
```

### "No issues found" (when issues exist)

This might indicate:
- API key issue (check console for errors)
- Model timeout (try again)
- Test files are actually clean (verify intentional issues exist)

### Rate Limit Errors

If you hit API rate limits:
- Wait a few minutes
- Reduce the number of test files
- Check your Anthropic API usage limits

## Testing in a Test Repository

For the most realistic test:

1. **Create a test repository on GitHub**
   ```bash
   # Create a new repo on GitHub
   # Clone it locally
   git clone https://github.com/your-username/test-repo.git
   cd test-repo
   ```

2. **Copy the bot files**
   ```bash
   cp -r /path/to/code-review-bot/.github .
   cp -r /path/to/code-review-bot/config .
   # Commit the workflow file
   git add .github/workflows/code-review.yml
   git commit -m "Add code review bot"
   git push
   ```

3. **Add the API key secret**
   - Go to repo Settings → Secrets → Actions
   - Add `ANTHROPIC_API_KEY`

4. **Create a test branch and PR**
   ```bash
   git checkout -b test-review
   # Add one of the test files
   cp /path/to/code-review-bot/test/sample-code/vulnerable-auth.js .
   git add vulnerable-auth.js
   git commit -m "Add test code"
   git push -u origin test-review
   # Create PR on GitHub targeting main
   ```

5. **Watch the bot work**
   - Go to the PR on GitHub
   - Check the "Actions" tab
   - Wait for the review to complete
   - See the bot's comments on your PR

## Test Checklist

Before deploying to production, verify:

- [ ] `npm test` completes successfully
- [ ] Bot identifies security issues
- [ ] Bot identifies bugs
- [ ] Bot identifies performance problems
- [ ] Review summary is clear and actionable
- [ ] Inline comments include line numbers
- [ ] Suggestions are specific and helpful
- [ ] No false positives on clean code
- [ ] Test with a real PR in test repository
- [ ] GitHub Actions workflow runs successfully
- [ ] Bot posts comments to the PR
- [ ] API costs are acceptable for your usage

## Next Steps

Once all tests pass:

1. ✅ Tests pass with sample files
2. ✅ Test with real PR succeeds
3. ✅ Review quality is acceptable
4. 🚀 Deploy to production repository

See [README.md](README.md) for deployment instructions.

## Cost Monitoring During Testing

Each test run costs approximately:
- **Sample files test**: $0.02 - $0.05
- **Small PR test**: $0.01 - $0.05
- **Medium PR test**: $0.05 - $0.15

Monitor your usage at: https://console.anthropic.com/

## Getting Help

If tests fail or you encounter issues:

1. Check the error message carefully
2. Verify environment variables are set
3. Ensure API key has credits
4. Review the [README.md](README.md) troubleshooting section
5. Check GitHub Actions logs for detailed errors

---

Happy testing! 🚀
