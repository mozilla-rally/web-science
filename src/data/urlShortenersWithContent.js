/**
 * An array of match patterns for known URL shorteners that also host
 * content. We maintain this subset of the dataset of known URL
 * shorteners so that we can properly handle self-links on these
 * websites.
 */
export const urlShortenerWithContentMatchPatterns = [
    "*://news.google.com/articles/*"
];
