/**
 * This module provides functionality for resolving shortened and shimmed URLs.
 * @module webScience.linkResolution
 */
import * as matching from "./matching.js";
import { urlShortenerMatchPatterns } from "./dependencies/urlShorteners.js";
import { ampCacheDomains, ampViewerDomainsAndPaths } from "./dependencies/ampCachesAndViewers.js";

/**
 * The timeout for fetch when resolving a link.
 * @constant {number}
 * @private
 * @default
 */
const fetchTimeoutMs = 5000;

/**
 * Whether the module has been initialized.
 * @type {boolean}
 * @private
 */
let initialized = false;

/**
 * A map where keys a URLs to resolve and objects are Promises for resolving the URLs.
 * @constant {Map<string, Promise>}
 * @private
 */
const promisesByUrl = new Map();

/**
 * A set of URLs where we are observing response headers.
 * @constant {Set<string>}
 * @private
 */
const trackedUrls = new Set();

/**
 * A map where keys are redirect target URLs and values are redirect source URLs. Recursively
 * traversing this mapping is equivalent to following the redirect chain for a URL in reverse
 * order.
 * TODO: This approach to storing and backtracking through redirects is problematic, because
 * multiple URLs can redirect to the same URL (leading to ambiguous backtracking).
 * @private
 */
const urlByRedirectedUrl = new Map();

/**
 * A RegExp that matches and parses AMP cache and viewer URLs. If there is a match, the RegExp provides several
 * named capture groups.
 *   * AMP Cache Matches
 *     * `ampCacheSubdomain` - The subdomain, which should be either a reformatted version of the
 *       URL domain or a hash of the domain. If there is no subdomain, this capture group
 *       is `undefined`.
 *     * `ampCacheDomain` - The domain for the AMP cache.
 *     * `ampCacheContentType` - The content type, which is either `c` for an HTML document, `i` for
 *        an image, or `r` for another resource. 
 *     * `ampCacheIsSecure` - Whether the AMP cache loads the resource via HTTPS. If it does, this
 *        capture group has the value `s/`. If it doesn't, this capture group is `undefined`.
 *     * `ampCacheUrl` - The underlying URL, without a specified scheme (i.e., `http://` or `https://`).
 *  * AMP Viewer Matches
 *     * `ampViewerDomainAndPath` - The domain and path for the AMP viewer.
 *     * `ampViewerUrl` - The underlying URL, without a specified scheme (i.e., `http://` or `https://`).
 * @see {@link https://developers.google.com/amp/cache/overview}
 * @see {@link https://amp.dev/documentation/guides-and-tutorials/learn/amp-caches-and-cors/amp-cache-urls/}
 * @constant {RegExp}
 */
export const ampRegExp = new RegExp(
    // AMP cache regular expression
    `(?:^https?://(?:(?<ampCacheSubdomain>[a-zA-Z0-9\\-\\.]*)\\.)?(?<ampCacheDomain>${ampCacheDomains.map(matching.escapeRegExpString).join("|")})/(?<ampCacheContentType>c|i|r)/(?<ampCacheIsSecure>s/)?(?<ampCacheUrl>.*)$)`
    + `|` +
    // AMP viewer regular expression
    `(?:^https?://(?<ampViewerDomainAndPath>${ampViewerDomainsAndPaths.map(matching.escapeRegExpString).join("|")})/(?<ampViewerUrl>.*)$)`
    , "i");

/**
 * A RegExp for matching URLs that have had Facebook's link shim applied.
 * @constant {RegExp}
 */
export const facebookLinkShimRegExp = /^https?:\/\/l.facebook.com\/l\.php\?u=/;

/**
 * Parse a URL from Facebook's link shim, if the shim was applied to the URL.
 * @param {string} url - A URL that may have Facebook's link shim applied.
 * @returns {string} If Facebook's link shim was applied to the URL, the unshimmed URL. Otherwise, just the URL.
 */
export function parseFacebookLinkShim(url) {
    if(!facebookLinkShimRegExp.test(url))
        return url;

    // Extract the original URL from the "u" parameter
    const urlObject = new URL(url);
    const uParamValue = urlObject.searchParams.get('u');
    if(uParamValue === null)
        return url;
    return uParamValue;
}

/**
 * Remove Facebook link decoration (the `fbclid` paramater) from a URL, if present.
 * @param {string} url  - A URL that may have Facebook link decoration.
 * @returns {string} The URL without Facebook link decoration.
 */
export function removeFacebookLinkDecoration(url) {
    const urlObj = new URL(url);
    urlObj.searchParams.delete("fbclid");
    return urlObj.href;
}

/**
 * Parse the underlying URL from an AMP cache or viewer URL, if the URL is an AMP cache or viewer URL.
 * @param {string} url - A URL that may be an AMP cache or viewer URL.
 * @returns {string} If the URL is an AMP cache or viewer URL, the parsed underlying URL. Otherwise, just the URL.
 */
export function parseAmpUrl(url) {
    if(!ampRegExp.test(url))
        return url;
    const parsedAmpUrl = ampRegExp.exec(url);
    // Reconstruct AMP cache URLs
    if(parsedAmpUrl.groups.ampCacheUrl !== undefined)
        return "http" +
            ((parsedAmpUrl.groups.ampCacheIsSecure === "s") ? "s" : "") +
            "://" +
            parsedAmpUrl.groups.ampCacheUrl;
    // Reconstruct AMP viewer URLs, assuming the protocol is HTTPS
    return "https://" + parsedAmpUrl.groups.ampViewerUrl;
}

/**
 * Resolve a shortened or shimmed URL to an original URL, by recursively resolving the URL and removing shims.
 * @param {string} url - The URL to resolve.
 * @returns {Promise<string>} - A Promise that either resolves to the original URL or is rejected with an error.
 */
export function resolveUrl(url) {
    if (!initialized) {
        return Promise.reject("module not initialized");
    }
    const urlResolutionPromise = new Promise(function (resolve, reject) {
      // store the resolve function in promisesByUrl. This function will be invoked when the 
      // url is resolved
      const resolves = promisesByUrl.get(url) || [];
      if (!resolves || !resolves.length) {
          promisesByUrl.set(url, resolves);
      }
      resolves.push({
          resolve: resolve,
          reject: reject
      });
      trackedUrls.add(url);
      // fetch this url
      fetchWithTimeout(url, {
          redirect: 'manual',
          headers: {
              /* With a browser User-Agent header, the response of news.google.com link shim is a HTML document that eventually redirects to the actual news page.
              This actual news link is not part of the HTTP response reader. However, using a non-browser User-Agent like curl the response header
              contains the redirected location. */
              'User-Agent': url.includes("news.google.com") ? 'curl/7.10.6 (i386-redhat-linux-gnu) libcurl/7.10.6 OpenSSL/0.9.7a ipv6 zlib/1.1.4' : ''
          }
      }, fetchTimeoutMs);
    });
    return urlResolutionPromise;
}

/**
 * Listener for webRequest.onHeadersReceived.
 * @param {Object} details - Details about the request.
 * @private
 */
function responseHeaderListener(details) {
    // Continue only if this url is relevant for link resolution
    if (!trackedUrls.has(details.url)) {
        // When a site has HSTS enabled, the browser silently upgrades
        // http requests to https, which means we won't match the returned
        // url against the one we requested. Check for a returned url that has
        // an s and matches against a non-https url we're looking for, and link
        // them if one exists.
        const httpVersion = details.url.replace("https", "http");
        if (!trackedUrls.has(httpVersion)) {
            return;
        }
        urlByRedirectedUrl.set(details.url, httpVersion);
    }

    // The location field in response header indicates the redirected URL
    // The response header from onHeadersReceived is an array of objects, one of which possibly
    // contains a field with name location (case insensitive).
    const redirectedURLLocation = details.responseHeaders.find(obj => {
        return obj.name.toUpperCase() === "LOCATION";
    });

    // if the location field in response header contains a new url
    if (redirectedURLLocation != null && (redirectedURLLocation.value != details.url)) {
        const nexturl = redirectedURLLocation.value;
        // Create a link between the next url and the initial url
        urlByRedirectedUrl.set(nexturl, details.url);
        // Add the next url so that we process it during the next onHeadersReceived
        trackedUrls.add(nexturl);
        // Send fetch request to the next url
        fetchWithTimeout(nexturl, {
            redirect: 'manual',
            headers: {
              'User-Agent': ''
            }
        }, fetchTimeoutMs);
    }
    else { // url is not redirected
        if (urlByRedirectedUrl.has(details.url)) {
            // backtrack urlByRedirectedUrl to get to the promise object that corresponds to this
            let url = details.url;
            while (urlByRedirectedUrl.has(url)) {
                const temp = url;
                url = urlByRedirectedUrl.get(url);
                urlByRedirectedUrl.delete(temp);
                trackedUrls.delete(temp);
            }
            // url now contains the initial url. Now, resolve the corresponding promises
            if (url && promisesByUrl.has(url)) {
                const resolves = promisesByUrl.get(url) || [];
                for (let i = 0; i < resolves.length; i++) {
                    const r = resolves[i].resolve;
                    r(details.url);
                }
                promisesByUrl.delete(url);
            }
        }
    }
}

/**
 * Listener for webRequest.onErrorOccurred.
 * @param {Object} responseDetails - Details of the error.
 * @private
 */
function trackError(responseDetails) {
    const url = responseDetails.url;
    if (promisesByUrl.has(url)) {
        const resolves = promisesByUrl.get(url) || [];
        for (let i = 0; i < resolves.length; i++) {
            const r = resolves[i].reject;
            r(responseDetails.error);
        }
        promisesByUrl.delete(url);
    }
}

/**
 * Initializes the module by setting up webRequest listeners.
 * TODO: Integrate this function into resolveUrl.
 */
export function initialize() {
    initialized = true;
    browser.webRequest.onHeadersReceived.addListener(responseHeaderListener, {
        urls: ["<all_urls>"]
    }, ["responseHeaders"]);
    browser.webRequest.onErrorOccurred.addListener(trackError, {
        urls: ["<all_urls>"]
    });
}

/**
 * An array of match patterns for known URL shorteners, loaded from `urlShortenerMatchPatterns.js`.
 * @constant {string[]}
 */
export { urlShortenerMatchPatterns };

/**
 * A RegExp for known URL shorteners, based on the match patterns loaded from `urlShortenerMatchPatterns.js`.
 * @constant {RegExp}
 */
export const urlShortenerRegExp = matching.matchPatternsToRegExp(urlShortenerMatchPatterns);

/**
 * Fetches a URL with a timeout, using an AbortController.
 * @param {string} url - The URL to request with fetch.
 * @param {Object} init - An init object to pass to fetch.
 * @param {number} timeout - The timeout in ms for the fetch request.
 * @private
 */
function fetchWithTimeout(url, init, timeout) {
    const controller = new AbortController();
    init.signal = controller.signal;
    fetch(url, init);
    setTimeout(() => {
        controller.abort()
    }, timeout);
}
