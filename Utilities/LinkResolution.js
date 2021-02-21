/**
 * Module for resolving a short url
 * @module WebScience.Utilities.LinkResolution
 */
import * as Debugging from "./Debugging.js";
import * as Matching from "./Matching.js";
import { urlShortenerMatchPatterns } from "../dependencies/urlShorteners.js";
import { ampCacheDomains, ampViewerDomainsAndPaths } from "../dependencies/ampCachesAndViewers.js";
const debugLog = Debugging.getDebuggingLog("Utilities.LinkResolution");

const fetchTimeoutMs = 5000;
let initialized = false;
// promisesByUrl is a mapping from a url to resolve and the resolve objects associated with it
const promisesByUrl = new Map();
// trackedUrls is a set for which the headers are observed
const trackedUrls = new Set();
// urlByRedirectedUrl is a mapping from a redirected url to url that redirected to it
// recursively traversing this mapping will get the redirect chain associated with an initial url
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
 * @constant
 * @type {RegExp}
 */
export const ampRegExp = new RegExp(
  // AMP cache regular expression
  `(?:^https?://(?:(?<ampCacheSubdomain>[a-zA-Z0-9\\-\\.]*)\\.)?(?<ampCacheDomain>${ampCacheDomains.map(Matching.escapeRegExpString).join("|")})/(?<ampCacheContentType>c|i|r)/(?<ampCacheIsSecure>s/)?(?<ampCacheUrl>.*)$)`
  + `|` +
  // AMP viewer regular expression
  `(?:^https?://(?<ampViewerDomainAndPath>${ampViewerDomainsAndPaths.map(Matching.escapeRegExpString).join("|")})/(?<ampViewerUrl>.*)$)`
  , "i");

/**
 * Function to resolve a given url to the final url that it points to
 * @param {string} url - URL to resolve
 * @returns {Promise.Object} - An object containing the destination url
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
 * Listener for https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onHeadersReceived
 * @param {Object} details contains details of the request
 */
function responseHeaderListener(details) {
  // Continue only if this url is relevant for link resolution
  if (!trackedUrls.has(details.url)) {
    return;
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
  } else { // url is not redirected
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
        const resolveObj = {
          source: url,
          dest: details.url
        };
        for (let i = 0; i < resolves.length; i++) {
          const r = resolves[i].resolve;
          r(resolveObj);
        }
        promisesByUrl.delete(url);
      }
    }
  }
}

/**
 * Listener for https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onErrorOccurred
 * @param {Object} responseDetails - Contains details of the error
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
 * Initializes the link resolution module by setting up listeners for onHeadersReceived event
 * @returns {void} Nothing
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
 * @constant
 * @type{Array<string>}
 */
export { urlShortenerMatchPatterns };

/**
 * A RegExp for known URL shorteners, based on the match patterns loaded from `urlShortenerMatchPatterns.js`.
 * @constant
 * @type{RegExp}
 */
export const urlShortenerRegExp = Matching.matchPatternsToRegExp(urlShortenerMatchPatterns);

/**
 * Fetch API doesn't provide a native timeout option. This function uses AbortController to
 * timeout fetch requests.
 * @param {string} url - resource to fetch
 * @param {Object} init - fetch initialization
 * @param {number} timeout - timeout in ms for fetch requests
 */
function fetchWithTimeout(url, init, timeout) {
  const controller = new AbortController();
  init.signal = controller.signal;
  fetch(url, init);
  setTimeout(() => controller.abort(), timeout);
}
