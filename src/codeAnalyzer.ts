import {
  PullRequestData,
  ChangedFile,
  CodeChange,
  FileChange,
  AnalyzedCode,
  ReviewConfig,
} from './types';

export class CodeAnalyzer {
  private config: ReviewConfig;

  constructor(config: ReviewConfig) {
    this.config = config;
  }

  /**
   * Analyzes the pull request and extracts meaningful code changes
   */
  analyze(prData: PullRequestData): AnalyzedCode {
    console.log('Analyzing code changes...');

    // Filter out excluded files
    const relevantFiles = prData.changedFiles.filter((file) =>
      this.shouldAnalyzeFile(file)
    );

    console.log(
      `Analyzing ${relevantFiles.length} of ${prData.changedFiles.length} changed files`
    );

    // Process each file
    const codeChanges: CodeChange[] = relevantFiles
      .map((file) => this.analyzeFile(file))
      .filter((change): change is CodeChange => change !== null);

    // Calculate statistics
    const totalLines = codeChanges.reduce(
      (sum, change) => sum + change.changes.length,
      0
    );
    const languages = [...new Set(codeChanges.map((c) => c.language))];

    // Generate summary
    const summary = this.generateSummary(prData, codeChanges);

    return {
      files: codeChanges,
      totalLines,
      languages,
      summary,
    };
  }

  /**
   * Determines if a file should be analyzed
   */
  private shouldAnalyzeFile(file: ChangedFile): boolean {
    const filename = file.filename.toLowerCase();

    // Check against excluded patterns
    for (const pattern of this.config.excludedFiles) {
      if (this.matchesPattern(filename, pattern.toLowerCase())) {
        console.log(`Skipping excluded file: ${file.filename}`);
        return false;
      }
    }

    // Skip files without meaningful changes
    if (file.status === 'removed') {
      return false;
    }

    // Skip binary files
    if (this.isBinaryFile(filename)) {
      console.log(`Skipping binary file: ${file.filename}`);
      return false;
    }

    return true;
  }

  /**
   * Checks if filename matches a glob-like pattern
   */
  private matchesPattern(filename: string, pattern: string): boolean {
    // Convert glob pattern to regex
    // Use a placeholder for ** to avoid the second * replacement corrupting it
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '\0GLOBSTAR\0')
      .replace(/\*/g, '[^/]*')
      .replace(/\0GLOBSTAR\0/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  }

  /**
   * Checks if a file is binary
   */
  private isBinaryFile(filename: string): boolean {
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
      '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
      '.exe', '.dll', '.so', '.dylib',
      '.woff', '.woff2', '.ttf', '.eot', '.otf',
      '.mp3', '.mp4', '.avi', '.mov', '.wav',
    ];

    return binaryExtensions.some((ext) => filename.endsWith(ext));
  }

  /**
   * Analyzes a single file
   */
  private analyzeFile(file: ChangedFile): CodeChange | null {
    if (!file.patch) {
      return null;
    }

    const language = this.detectLanguage(file.filename);
    const changes = this.parsePatch(file.patch, file.content || '');

    if (changes.length === 0) {
      return null;
    }

    return {
      file: file.filename,
      language,
      changes,
    };
  }

  /**
   * Detects programming language from filename
   */
  private detectLanguage(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase() || '';

    const languageMap: Record<string, string> = {
      // JavaScript/TypeScript
      js: 'JavaScript',
      jsx: 'JavaScript (React)',
      ts: 'TypeScript',
      tsx: 'TypeScript (React)',
      mjs: 'JavaScript (ES Module)',
      cjs: 'JavaScript (CommonJS)',

      // Python
      py: 'Python',
      pyw: 'Python',

      // Java/Kotlin
      java: 'Java',
      kt: 'Kotlin',
      kts: 'Kotlin',

      // C/C++
      c: 'C',
      h: 'C/C++ Header',
      cpp: 'C++',
      cc: 'C++',
      cxx: 'C++',
      hpp: 'C++ Header',

      // C#
      cs: 'C#',

      // Go
      go: 'Go',

      // Rust
      rs: 'Rust',

      // Ruby
      rb: 'Ruby',

      // PHP
      php: 'PHP',

      // Swift
      swift: 'Swift',

      // Dart
      dart: 'Dart',

      // Web
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      sass: 'Sass',
      less: 'Less',

      // Config/Data
      json: 'JSON',
      yaml: 'YAML',
      yml: 'YAML',
      xml: 'XML',
      toml: 'TOML',

      // Shell
      sh: 'Shell',
      bash: 'Bash',
      zsh: 'Zsh',

      // SQL
      sql: 'SQL',

      // Other
      md: 'Markdown',
      dockerfile: 'Dockerfile',
    };

    return languageMap[extension] || 'Unknown';
  }

  /**
   * Parses a git diff patch to extract changes
   */
  private parsePatch(patch: string, fileContent: string): FileChange[] {
    const changes: FileChange[] = [];
    const lines = patch.split('\n');
    let currentLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Parse hunk headers to get line numbers
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
        if (match) {
          currentLine = parseInt(match[1], 10);
        }
        continue;
      }

      // Skip context lines in the patch header
      if (line.startsWith('---') || line.startsWith('+++')) {
        continue;
      }

      // Process added lines
      if (line.startsWith('+')) {
        changes.push({
          lineNumber: currentLine,
          type: 'addition',
          content: line.substring(1),
          context: this.extractContext(lines, i, 3),
        });
        currentLine++;
      }
      // Process removed lines
      else if (line.startsWith('-')) {
        changes.push({
          lineNumber: currentLine,
          type: 'deletion',
          content: line.substring(1),
          context: this.extractContext(lines, i, 3),
        });
        // Don't increment currentLine for deletions
      }
      // Context lines
      else if (line.startsWith(' ')) {
        currentLine++;
      }
    }

    return changes;
  }

  /**
   * Extracts context lines around a change
   */
  private extractContext(lines: string[], index: number, contextSize: number): string[] {
    const context: string[] = [];
    const start = Math.max(0, index - contextSize);
    const end = Math.min(lines.length, index + contextSize + 1);

    for (let i = start; i < end; i++) {
      if (i !== index) {
        const line = lines[i];
        // Remove diff markers for context
        const cleaned = line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')
          ? line.substring(1)
          : line;
        context.push(cleaned);
      }
    }

    return context;
  }

  /**
   * Generates a summary of the code changes
   */
  private generateSummary(prData: PullRequestData, changes: CodeChange[]): string {
    const fileCount = changes.length;
    const languages = [...new Set(changes.map((c) => c.language))];

    let summary = `This PR modifies ${fileCount} file${fileCount !== 1 ? 's' : ''} `;
    summary += `with ${prData.additions} addition${prData.additions !== 1 ? 's' : ''} `;
    summary += `and ${prData.deletions} deletion${prData.deletions !== 1 ? 's' : ''}. `;

    if (languages.length > 0) {
      summary += `Languages: ${languages.join(', ')}.`;
    }

    return summary;
  }

  /**
   * Checks if the PR is too large to review
   */
  isTooLarge(prData: PullRequestData): boolean {
    const totalChanges = prData.additions + prData.deletions;
    return totalChanges > this.config.maxPRSize;
  }
}
