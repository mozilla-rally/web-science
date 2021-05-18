/**
 * This module provides functionality for resolving shortened and shimmed URLs.
 * @module linkResolution
 */

import * as matching from "./matching.js";
import * as permissions from "./permissions.js";
import * as id from "./id.js";
import * as pageManager from "./pageManager.js";
import * as inline from "./inline.js";
import * as messaging from "./messaging.js";
import { urlShortenerMatchPatterns } from "./data/urlShorteners.js";
import { ampCacheDomains, ampViewerDomainsAndPaths } from "./data/ampCachesAndViewers.js";
import { parse as tldtsParse } from "tldts";
import linkResolutionTwitterContentScript from "./content-scripts/linkResolution.twitter.content.js";
import linkResolutionGoogleNewsContentScript from "./content-scripts/linkResolution.googleNews.content.js";

// AMP caches and viewers

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
 * A MatchPatternSet for AMP caches and viewers.
 * @constant {matching.MatchPatternSet}
 */
export const ampMatchPatternSet = matching.createMatchPatternSet(
    matching.domainsToMatchPatterns(ampCacheDomains, false).concat(
        ampViewerDomainsAndPaths.map(ampViewerDomainAndPath => `*://${ampViewerDomainAndPath}*`)));

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

// Facebook link shims

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

// URL shorteners

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
 * A matching.MatchPatternSet for known URL shorteners, based on the match patterns loaded from `urlShortenerMatchPatterns.js`.
 * @constant {matching.MatchPatternSet}
 */
export const urlShortenerMatchPatternSet = matching.createMatchPatternSet(urlShortenerMatchPatterns);

// Public suffix + 1

/**
 * Extracts the public suffix + 1 from a URL.
 * @param {string} url - The URL.
 * @returns {string} The public suffix + 1.
 * @example <caption>Example usage of urlToPS1.</caption>
 * // returns "mozilla.org"
 * urlToPS1("https://www.mozilla.org/");
 */
export function urlToPS1(url) {
    return tldtsParse((new URL(url)).hostname).domain;
}

// URL resolution

/**
 * The timeout (in ms) for fetch when resolving a link.
 * @constant {number}
 * @private
 * @default
 */
const fetchTimeout = 5000;

/**
 * The maximum number of redirects to follow with fetch when resolving a link.
 * @constant {number}
 * @private
 * @default
 */
const fetchMaxRedirects = 3;

/**
 * Whether the module has been initialized.
 * @type {boolean}
 * @private
 */
let initialized = false;

/**
 * A map where each key is a webRequest requestId and each value is a link resolution ID.
 * @constant {Map<string, string>}
 * @private
 */
const requestIdToLinkResolutionId = new Map();

/**
 * @typedef {Object} LinkResolutionData
 * @property {Function} resolve - The resolve function for the link resolution Promise.
 * @property {Function} reject - The reject function for the link resolution Promise.
 * @property {number} timeoutId - The timeout ID for the link resolution fetch.
 * @property {string} requestId - The webRequest requestId for the link resolution fetch.
 * @property {number} redirects - The number of redirects in the link resolution fetch.
 * @property {boolean} parseAmpUrl - If the resolved URL is an AMP URL, parse it.
 * @property {boolean} parseFacebookLinkShim - If the resolved URL has a Facebook shim applied, parse it.
 * @property {boolean} removeFacebookLinkDecoration - If the resolved URL has Facebook link decoration, remove it.
 * @property {boolean} onlyRequestKnownUrlShorteners - If the resolution should only issue HTTP requests for
 * known URL shorteners, and should treat all other origins as resolved (i.e., if a known shortener has a 3xx
 * redirect to an origin that isn't a known shortener, treat that redirection target as the resolved URL). When
 * this value is false, resolution will follow all redirects until either loading completes, the redirect limit is
 * reached, or there is an error.
 * @private
 */

/**
 * A map where each key is a link resolution ID (randomly generated) and each value is a
 * Promise to resolve when resolution is complete.
 * @constant {Map<string, LinkResolutionData>}
 * @private
 */
const linkResolutionIdToData = new Map();

/**
 * A special HTTP header name to use for associating a link resolution ID with an outbound
 * request.
 * @constant {string}
 * @private
 * @default
 */
const httpHeaderName = "X-WebScience-LinkResolution-ID";

/**
 * Resolve a shortened or shimmed URL to an original URL, by recursively resolving the URL and removing shims.
 * @param {string} url - The URL to resolve.
 * @param {Object} [options] - Options for resolving the URL.
 * @param {boolean} [options.parseAmpUrl=true] - If the resolved URL or the original URL is an AMP URL, parse it. See
 * `parseAmpUrl` for detais.
 * @param {boolean} [options.parseFacebookLinkShim=true] - If the resolved URL or the original URL has a Facebook shim
 * applied, parse it. See `parseFacebookLinkShim` for detais.
 * @param {boolean} [options.removeFacebookLinkDecoration=true] - If the resolved URL or the original URL has Facebook link
 * decoration, remove it. See `removeFacebookLinkDecoration` for details.
 * @param {boolean} [options.applyRegisteredUrlMappings=true] - If the original URL matches a registered URL mapping, apply
 * the mapping. See `registerUrlMappings` for details.
 * @param {string} [options.request="known_shorteners"] - Whether to issue HTTP requests to resolve the URL,
 * following HTTP 3xx redirects. Valid values are "always", "known_shorteners" (only issue a request if the original URL or
 * a redirection target URL matches a known URL shortener), and "never". Note that setting this value to "always" could have
 * performance implications, since it requires completely loading the destination URL.
 * @returns {Promise<string>} - A Promise that either resolves to the original URL or is rejected with an error.
 */
export function resolveUrl(url, options) {
    // Using the pre-ES6 approach to default arguments to avoid ambiguity with function names
    if(!(typeof options === "object")) {
        options = { };
    }
    options.parseAmpUrl = "parseAmpUrl" in options ? options.parseAmpUrl : true;
    options.parseFacebookLinkShim = "parseFacebookLinkShim" in options ? options.parseFacebookLinkShim : true;
    options.removeFacebookLinkDecoration = "removeFacebookLinkDecoration" in options ? options.removeFacebookLinkDecoration : true;
    options.applyRegisteredUrlMappings = "applyRegisteredUrlMappings" in options ? options.applyRegisteredUrlMappings : true;
    options.request = "request" in options ? options.request : "known_shorteners";

    initialize();

    if(options.parseAmpUrl) {
        url = parseAmpUrl(url);
    }

    if(options.parseFacebookLinkShim) {
        url = parseFacebookLinkShim(url);
    }

    if(options.removeFacebookLinkDecoration) {
        url = removeFacebookLinkDecoration(url);
    }

    if(options.applyRegisteredUrlMappings) {
        url = applyRegisteredUrlMappings(url);
    }

    // If we don't need to resolve the URL, just return the current URL value in a Promise
    if((options.request === "never") ||
    ((options.request === "known_shorteners") && !urlShortenerMatchPatternSet.matches(url))) {
        return Promise.resolve(url);
    }

    // Resolve the URL
    // The webRequest API tracks HTTP request lifecycle with a unique requestId value, which we
    // can match to this link resolution by generating a random link resolution ID, inserting the
    // link resolution ID as a special HTTP header when fetching the link, observing HTTP headers
    // with webRequest to match the link resolution ID to a webRequest requestId, then removing
    // the special HTTP header before the request is sent
    const linkResolutionId = id.generateId();
    const controller = new AbortController();
    const init = {
        signal: controller.signal,
        // Don't include cookies or a User-Agent with the request, because they can cause shorteners
        // to provide HTML/JS redirects rather than HTTP redirects
        credentials: "omit",
        headers: {
            "User-Agent": "",
            [httpHeaderName]: linkResolutionId
        }
    };

    // Special Cases
    const urlObj = new URL(url);

    // Twitter (t.co)
    // Removing the amp=1 parameter results in more reliable HTTP redirects instead of HTML/JS redirects
    if(urlObj.hostname === "t.co") {
        urlObj.searchParams.delete("amp");
    }

    // Google News (news.google.com)
    // Setting the User-Agent to curl results in more reliable HTTP redirects instead of HTML/JS redirects
    if(urlObj.hostname.endsWith("news.google.com")) {
        init.headers["User-Agent"] = "curl/7.10.6 (i386-redhat-linux-gnu) libcurl/7.10.6 OpenSSL/0.9.7a ipv6 zlib/1.1.4";
    }

    url = urlObj.href;

    // Fetch the URL with a timeout, discarding the outcome of the fetch Promise because the logic for
    // resolving URLs is in the webRequest handlers (which have greater permissions for inspecting and
    // modifying the HTTP request lifecycle)
    fetch(url, init).then(() => {}, () => {});
    const timeoutId = setTimeout(() => {
        controller.abort();
        completeResolution(linkResolutionId, false, undefined, "Error: webScience.linkResolution.resolveUrl fetch request timed out.");
    }, fetchTimeout);

    // Store the link resolution data, including promise resolve and reject functions
    return new Promise((resolve, reject) => {
        linkResolutionIdToData.set(linkResolutionId, {
            resolve,
            reject,
            timeoutId,
            requestId: -1,
            redirects: 0,
            parseAmpUrl,
            parseFacebookLinkShim,
            removeFacebookLinkDecoration,
            onlyRequestKnownUrlShorteners: options.request === "known_shorteners"
        });
    });
}

/**
 * Complete resolution of a link via HTTP requests, under circumstances specified in the arguments.
 * @param {string} linkResolutionId - The link resolution ID.
 * @param {boolean} success - Whether link resolution was successful.
 * @param {string} [resolvedUrl] - The URL that resulted from resolution.
 * @param {string} [errorMessage] - An error message because resolution failed.
 * @private
 */
function completeResolution(linkResolutionId, success, resolvedUrl, errorMessage) {
    const linkResolutionData = linkResolutionIdToData.get(linkResolutionId);
    const resolve = linkResolutionData.resolve;
    const reject = linkResolutionData.reject;
    clearTimeout(linkResolutionData.timeoutId);

    if(success) {
        if(linkResolutionData.parseAmpUrl) {
            resolvedUrl = parseAmpUrl(resolvedUrl);
        }
        if(linkResolutionData.parseFacebookLinkShim) {
            resolvedUrl = parseFacebookLinkShim(resolvedUrl);
        }
        if(linkResolutionData.removeFacebookLinkDecoration) {
            resolvedUrl = removeFacebookLinkDecoration(resolvedUrl);
        }
    }

    // Remove the data structure entries for this link resolution
    if(linkResolutionData.requestId !== "") {
        requestIdToLinkResolutionId.delete(linkResolutionData.requestId);
    }
    linkResolutionIdToData.delete(linkResolutionId);

    if(success) {
        resolve(resolvedUrl);
        return;
    }
    reject(errorMessage);
}

/**
 * A listener for the browser.webRequest.onBeforeSendHeaders event. This listener blocks
 * the request, extracts the link resolution ID from a header, updates the link
 * resolution data structures, and removes the header. This listener also cancels the
 * request if it exceeds the redirect limit.
 * @param {Object} details - Details about the request.
 * @returns {browser.webRequest.BlockingResponse|undefined}
 * @private
 */
function onBeforeSendHeadersListener(details) {
    let linkResolutionId = undefined;
    let resolutionData = undefined;
    let requestHeaderIndex = -1;
    for(let i = 0; i < details.requestHeaders.length; i++) {
        const requestHeader = details.requestHeaders[i];
        if(requestHeader.name === httpHeaderName) {
            linkResolutionId = requestHeader.value;
            requestHeaderIndex = i;
            break;
        }
    }

    // If the HTTP request header includes a link resolution ID, update the
    // internal data structures to associate that link resolution ID with
    // the webRequest requestId
    if(linkResolutionId !== undefined) {
        resolutionData = linkResolutionIdToData.get(linkResolutionId);
        if(resolutionData !== undefined) {
            resolutionData.requestId = details.requestId;
            requestIdToLinkResolutionId.set(details.requestId, linkResolutionId);
        }
    }
    // If the HTTP request header doesn't include a link resolution ID,
    // we might already have a mapping from the webRequest requestId to
    // the link resolution ID
    else {
        linkResolutionId = requestIdToLinkResolutionId.get(details.requestId);
        if(linkResolutionId !== undefined) {
            resolutionData = linkResolutionIdToData.get(linkResolutionId);
        }
    }

    // If this link resolution should only issue HTTP requests to known
    // URL shorteners, and this is not a request to a known URL shortener,
    // consider the link resolved and cancel the request
    if((resolutionData !== undefined) &&
    resolutionData.onlyRequestKnownUrlShorteners &&
    !urlShortenerMatchPatternSet.matches(details.url)) {
        completeResolution(linkResolutionId, true, details.url, undefined);
        return {
            cancel: true
        };
    }

    // Check the redirect limit and cancel the request if it's exceeded
    if((resolutionData !== undefined) &&
    resolutionData.redirects > fetchMaxRedirects) {
        completeResolution(linkResolutionId, false, undefined, "Error: webScience.linkResolution.resolveUrl fetch request exceeded redirect limit.");
        return {
            cancel: true
        };
    }

    // If there's an HTTP header with the link resolution ID, remove it
    if(requestHeaderIndex >= 0) {
        details.requestHeaders.splice(requestHeaderIndex, 1);
        return {
            requestHeaders: details.requestHeaders
        };
    }
}

/**
 * Listener for webRequest.onBeforeRedirect.
 * @param {Object} details - Details about the request.
 * @private
 */
function onBeforeRedirectListener(details) {
    const linkResolutionId = requestIdToLinkResolutionId.get(details.requestId);
    if(linkResolutionId !== undefined) {
        const linkResolutionData = linkResolutionIdToData.get(linkResolutionId);
        linkResolutionData.redirects++;
    }
}

/**
 * Listener for webRequest.onCompleted.
 * @param {Object} details - Details about the request.
 * @private
 */
function onCompletedListener(details) {
    const linkResolutionId = requestIdToLinkResolutionId.get(details.requestId);
    if(linkResolutionId !== undefined) {
        completeResolution(linkResolutionId, true, details.url, undefined);
    }
}

/**
 * Listener for webRequest.onErrorOccurred.
 * @param {Object} details - Details of the error.
 * @private
 */
function onErrorListener(details) {
    const linkResolutionId = requestIdToLinkResolutionId.get(details.requestId);
    if(linkResolutionId !== undefined) {
        completeResolution(linkResolutionId, false, undefined, "Error: webScience.linkResolution.resolveUrl fetch request encountered a network error.");
    }
}

/**
 * Initialize the module, registering event listeners for `resolveUrl` and built-in content scripts for parsing
 * and registering URL mappings (currently Twitter and Google News). Runs only once. This function is automatically
 * called by `resolveUrl`, but you can call it separately if you want to use registered URL mappings without
 * `resolveUrl`.
 */
export function initialize() {
    if(initialized) {
        return;
    }
    initialized = true;

    permissions.check({
        module: "webScience.linkResolution",
        requiredPermissions: [ "webRequest", "webRequestBlocking" ],
        suggestedOrigins: [ "<all_urls>" ]
    });

    // URL resolution via HTTP requests
    
    // Set listeners for webRequest lifecycle events
    // By setting the windowId filter to WINDOW_ID_NONE, we can
    // ignore requests associated with ordinary web content
    browser.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeadersListener,
        {
            urls: [ "<all_urls>" ],
            windowId: browser.windows.WINDOW_ID_NONE
        },
        [ "requestHeaders", "blocking" ]);
    browser.webRequest.onBeforeRedirect.addListener(onBeforeRedirectListener,
        {
            urls: [ "<all_urls>" ],
            windowId: browser.windows.WINDOW_ID_NONE
        });
    browser.webRequest.onCompleted.addListener(onCompletedListener,
        {
            urls: [ "<all_urls>" ],
            windowId: browser.windows.WINDOW_ID_NONE
        });
    browser.webRequest.onErrorOccurred.addListener(onErrorListener,
        {
            urls: [ "<all_urls>" ],
            windowId: browser.windows.WINDOW_ID_NONE
        });

    // URL mapping parsers in content scripts

    // Listen for the page visit stop event, because we should discard URL mappings for that page shortly afterward
    pageManager.onPageVisitStop.addListener(pageVisitStopListener);

    // Register the content script for parsing URL mappings on Twitter, if the extension has permission for
    // Twitter URLs
    browser.permissions.contains({ origins: [ "*://*.twitter.com/*" ]}).then(hasPermission => {
        if(hasPermission) {
            browser.contentScripts.register({
                matches: [ "*://*.twitter.com/*" ],
                js: [{
                    code: inline.dataUrlToString(linkResolutionTwitterContentScript)
                }],
                runAt: "document_idle"
            });
        }
    });

    // Register the content script for parsing URL mappings on Google News, if the extension has permission for
    // Google News URLs
    browser.permissions.contains({ origins: [ "*://*.news.google.com/*" ]}).then(hasPermission => {
        if(hasPermission) {
            browser.contentScripts.register({
                matches: [ "*://*.news.google.com/*" ],
                js: [{
                    code: inline.dataUrlToString(linkResolutionGoogleNewsContentScript)
                }],
                runAt: "document_idle"
            });
        }
    });

    // Register a message listener for URL mappings parsed by content scripts
    messaging.onMessage.addListener(urlMappingsContentScriptMessageListener, {
        type: "webScience.linkResolution.registerUrlMappings",
        schema: {
            pageId: "string",
            urlMappings: "object"
        }
    });
}

/**
 * @typedef {Object} UrlMapping
 * @property {string} sourceUrl - The source URL for the mapping.
 * @property {string} destinationUrl - The destination URL for the mapping.
 * @property {boolean} ignoreSourceUrlParameters - Whether to ignore parameters when matching URLs against the source URL.
 */

/**
 * @typedef {Object} RegisteredUrlMappings
 * @property {Function} unregister - Unregister the URL mappings. 
 */

/**
 * A map of registered URL mappings where keys are source URLs (without parameters if `ignoreSourceUrlParamaters` is
 * specified) and values are sets of UrlMapping objects with an additional `registrationId` property.
 * @constant {Map<string, Set<UrlMapping>>}
 * @private
 */
const registeredUrlMappings = new Map();

/**
 * A map of page IDs to sets of registered URL mappings. The mappings are automatically unregistered shortly after
 * a page visit ends.
 * @constant {Map<string, Set<RegisteredUrlMappings>>}
 * @private
 */
const pageIdsWithRegisteredUrlMappings = new Map();

/**
 * Register known URL mappings for use in link resolution. This functionality allows studies to minimize HTTP requests
 * for link resolution when a URL mapping can be parsed from page content.
 * @param {UrlMapping[]} urlMappings - The URL mappings to register.
 * @param {string} [pageId=null] - An optional page ID for the page that the URL mappings were parsed from. If a page
 * ID is provided, the mappings will be automatically removed shortly after the page visit ends.
 * @returns {RegisteredUrlMappings} An object that allows unregistering the URL mappings.
 * @example
 * // A content script parses URL mappings from a Twitter page, then in the background script:
 * webScience.linkResolution.registerUrlMappings([
 *   {
 *     sourceUrl: "https://t.co/djogkKUD5y?amp=1",
 *     destinationUrl: "https://researchday.princeton.edu/",
 *     ignoreSourceUrlParameters: true
 *   },
 *   // Note that the following mapping involves a known URL shortener and would require further resolution
 *   {
 *     sourceUrl: "https://t.co/qQTRITLZKP?amp=1",
 *     destinationUrl: "https://mzl.la/3jh1VgZ",
 *     ignoreSourceUrlParameters: true
 *   }
 * ]);
 */
export function registerUrlMappings(urlMappings, pageId = null) {
    // Generate a unique ID for this registration and maintain a set of registered source URLs,
    // so that we can disambiguate in the situation where there are multiple mappings registered
    // for the same source URL
    const registrationId = id.generateId();
    const sourceUrls = new Set();
    for(const urlMapping of urlMappings) {
        let sourceUrl = urlMapping.sourceUrl;
        // If the mapping specifies ignoring the source URL parameters, remove any parameters
        if(urlMapping.ignoreSourceUrlParameters) {
            const sourceUrlObj = new URL(urlMapping.sourceUrl);
            sourceUrlObj.search = "";
            sourceUrl = sourceUrlObj.href;
        }
        sourceUrls.add(sourceUrl);
        let registeredUrlMappingsForSourceUrl = registeredUrlMappings.get(sourceUrl);
        if(registeredUrlMappingsForSourceUrl === undefined) {
            registeredUrlMappingsForSourceUrl = new Set();
            registeredUrlMappings.set(sourceUrl, registeredUrlMappingsForSourceUrl);
        }
        registeredUrlMappingsForSourceUrl.add({
            sourceUrl,
            destinationUrl: urlMapping.destinationUrl,
            ignoreSourceUrlParameters: urlMapping.ignoreSourceUrlParameters,
            registrationId
        });
    }
    const unregisterObj = {
        // Unregister the registered URL mappings, removing both individual mappings from this
        // registration and source URLs that no longer have any mappings
        unregister: () => {
            // Keep track of source URLs that will have no remaining mappings after removing
            // these registered mappings
            const sourceUrlsToRemove = new Set();
            for(const sourceUrl of sourceUrls) {
                const registeredUrlMappingsForSourceUrl = registeredUrlMappings.get(sourceUrl);
                if(registeredUrlMappingsForSourceUrl === undefined) {
                    continue;
                }
                // Keep track of registered mappings for the source URL to remove
                const registeredUrlMappingsToRemove = new Set();
                for(const registeredUrlMapping of registeredUrlMappingsForSourceUrl) {
                    if(registeredUrlMapping.registrationId === registrationId) {
                        registeredUrlMappingsToRemove.add(registeredUrlMapping);
                    }
                }
                for(const registeredUrlMappingToRemove of registeredUrlMappingsToRemove) {
                    registeredUrlMappingsForSourceUrl.delete(registeredUrlMappingToRemove);
                }
                if(registeredUrlMappingsForSourceUrl.size === 0) {
                    sourceUrlsToRemove.add(sourceUrl);
                }
            }
            for(const sourceUrlToRemove of sourceUrlsToRemove) {
                registeredUrlMappings.delete(sourceUrlToRemove);
            }
        }
    };

    // If a page ID is specified, store the return object in a map so we can call unregister
    // when the page visit ends
    if(pageId !== null) {
        let registeredUrlMappingsForPageId = pageIdsWithRegisteredUrlMappings.get(pageId);
        if(registeredUrlMappingsForPageId === undefined) {
            registeredUrlMappingsForPageId = new Set();
            pageIdsWithRegisteredUrlMappings.set(pageId, registeredUrlMappingsForPageId);
        }
        registeredUrlMappingsForPageId.add(unregisterObj);
    }

    return unregisterObj;
}

/***
 * Apply the URL mappings that have been registered with `registerUrlMappings`. This function
 * first tries to apply a mapping with URL parameters and then tries to apply a mapping without
 * URL parameters. If there is no mapping to apply, this function returns the provided URL.
 * @param {string} url - The URL to apply registered URL mappings to.
 * @returns {string} The provided URL with a URL mapping applied or, if there is no mapping to
 * apply, the provided URL.
 */
export function applyRegisteredUrlMappings(url) {
    // Try to apply a mapping with parameters
    const registeredMappingsForUrl = registeredUrlMappings.get(url);
    if(registeredMappingsForUrl !== undefined) {
        for(const registeredMappingForUrl of registeredMappingsForUrl) {
            if(url === registeredMappingForUrl.sourceUrl) {
                return registeredMappingForUrl.destinationUrl;
            }
        }
    }

    // Try to apply a mapping without parameters
    const urlObj = new URL(url);
    urlObj.search = "";
    const urlWithoutParameters = urlObj.href;
    const registeredMappingsForUrlWithoutParameters = registeredUrlMappings.get(urlWithoutParameters);
    if(registeredMappingsForUrlWithoutParameters !== undefined) {
        for(const registeredMappingForUrlWithoutParameters of registeredMappingsForUrlWithoutParameters) {
            if((urlWithoutParameters === registeredMappingForUrlWithoutParameters.sourceUrl) && registeredMappingForUrlWithoutParameters.ignoreSourceUrlParameters) {
                return registeredMappingForUrlWithoutParameters.destinationUrl;
            }
        }
    }

    // If there was no mapping to apply, return the input URL
    return url;
}

/**
 * A listener for messages from the URL parsing content scripts that registers
 * parsed URL mappings.
 * @param {Object} message - The message from the content script.
 * @param {UrlMapping[]} message.urlMappings - The URL mappings parsed by the content script.
 * @param {string} message.pageId - The page ID for the page where the URL mappings were parsed.
 * @private
 */
function urlMappingsContentScriptMessageListener({ urlMappings, pageId }) {
    registerUrlMappings(urlMappings, pageId);
}

/**
 * The delay, in milliseconds, to wait after a page visit stop event to remove any
 * registered URL mappings associated with the page.
 * @constant {number}
 * @private
 */
const registeredUrlMappingPageVisitStopExpiration = 5000;

/**
 * A listener for the pageManager.onPageVisitStop event that expires registered URL mappings.
 * @param {pageManager.PageVisitStopDetails} details
 * @private
 */
function pageVisitStopListener({ pageId }) {
    const registeredUrlMappingsForPageId = pageIdsWithRegisteredUrlMappings.get(pageId);
    if(registeredUrlMappingsForPageId !== undefined) {
        setTimeout(() => {
            for(const registeredUrlMappingForPageId of registeredUrlMappingsForPageId) {
                registeredUrlMappingForPageId.unregister();
            }
            pageIdsWithRegisteredUrlMappings.delete(pageId);
        }, registeredUrlMappingPageVisitStopExpiration);
    }
}
