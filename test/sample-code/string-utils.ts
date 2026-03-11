/**
 * String utility functions for common text transformations.
 */

const MAX_SLUG_LENGTH = 200;
const MAX_TRUNCATE_LENGTH = 10000;

/**
 * Converts a string to a URL-friendly slug.
 * Replaces spaces and special characters with hyphens, lowercases the result,
 * and trims leading/trailing hyphens.
 *
 * @param input - The string to slugify.
 * @returns A URL-safe slug string.
 */
export function slugify(input: string): string {
  return input
    .trim()
    .slice(0, MAX_SLUG_LENGTH)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Truncates a string to a maximum length, appending an ellipsis if truncated.
 *
 * @param input - The string to truncate.
 * @param maxLength - The maximum allowed length (must be >= 4 to fit ellipsis).
 * @returns The truncated string, or the original if it fits within maxLength.
 */
export function truncate(input: string, maxLength: number): string {
  const safeMax = Math.min(Math.max(maxLength, 4), MAX_TRUNCATE_LENGTH);

  if (input.length <= safeMax) {
    return input;
  }

  return input.slice(0, safeMax - 3) + '...';
}

/**
 * Capitalises the first letter of each word in a string.
 *
 * @param input - The string to title-case.
 * @returns The title-cased string.
 */
export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());
}

/**
 * Counts the number of words in a string.
 * A word is defined as a contiguous sequence of non-whitespace characters.
 *
 * @param input - The string to count words in.
 * @returns The word count (0 for empty or whitespace-only strings).
 */
export function wordCount(input: string): number {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

/**
 * Removes duplicate whitespace from a string, collapsing multiple spaces
 * into a single space and trimming the result.
 *
 * @param input - The string to normalise.
 * @returns The normalised string with single spaces.
 */
export function normaliseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}
