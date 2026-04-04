export const DISALLOWED_BLOG_QUOTE = '"';

export function stripDisallowedBlogQuotes(value: string): string {
  return value.replaceAll(DISALLOWED_BLOG_QUOTE, '');
}

export function containsDisallowedBlogQuotes(value: string): boolean {
  return value.includes(DISALLOWED_BLOG_QUOTE);
}
