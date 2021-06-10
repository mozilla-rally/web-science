/**
 * An array of match patterns for known URL shorteners that also host
 * content with the same public suffix + 1. We maintain this subset of
 * the dataset of known URL shorteners so that we can correctly and
 * efficiently handle links that initially appear to be self-links based
 * on public suffix + 1, but that might resolve to a URL with a different
 * public suffix + 1.
 */
export const urlShortenerWithContentMatchPatterns = [
    "*://news.google.com/articles/*"
];
