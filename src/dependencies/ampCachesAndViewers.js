/**
 * An array of AMP cache domains., represented as domains and paths.
 * This representation facilitates parsing AMP urls in `LinkResolution`.
 * @constant
 * @type{Array<string>}
 */
export const ampCacheDomains = [
    "amp.cloudflare.com", // Cloudflare AMP Cache
    "cdn.ampproject.org", // Google AMP Cache
    "www.bing-amp.com" // Microsoft Bing AMP Cache
];

/**
 * An array of AMP viewers, represented as domains with paths.
 * This representation facilitates parsing AMP urls in `LinkResolution`.
 * @constant
 * @type{Array<string>}
 */
export const ampViewerDomainsAndPaths = [
    "www.google.com/amp" // Google AMP Viewer
];