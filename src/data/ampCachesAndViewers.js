/**
 * An array of AMP cache domains, represented as domains and paths.
 * This representation facilitates parsing AMP urls in `LinkResolution`.
 * Note that the Cloudflare cache is deprecated, but we retain it for
 * completeness.
 * @constant {string[]}
 * @see {@link https://cdn.ampproject.org/caches.json}
 * @see {@link https://blog.cloudflare.com/announcing-amp-real-url/}
 */
export const ampCacheDomains = [
    "amp.cloudflare.com", // Cloudflare AMP Cache
    "cdn.ampproject.org", // Google AMP Cache
    "www.bing-amp.com" // Microsoft Bing AMP Cache
];

/**
 * An array of AMP viewers, represented as domains with paths.
 * This representation facilitates parsing AMP urls in `LinkResolution`.
 * @constant {string[]}
 * @see {@link https://developers.google.com/search/docs/guides/about-amp}
 */
export const ampViewerDomainsAndPaths = [
    "www.google.com/amp" // Google AMP Viewer
];
