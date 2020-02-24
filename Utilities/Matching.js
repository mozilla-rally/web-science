/**
 * This module provides utilities for matching URLs against domain names.
 * 
 * @module WebScience.Utilities.Matching
 */

/** 
 * Class for testing whether a URL matches a set of domains.
 * Currently implemented with the native RegExp over the full URL, which gives good performance.
 * We might be able to speed this up by parsing the URL and then only matching domains.
 */
export class UrlMatcher {
    /**
     * Create a URL matcher.
     * @param {string[]} domains - The set of domains to match against.
     * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
     */
    constructor(domains, matchSubdomains = true) {
        this.regExp = new RegExp(createUrlRegexString(domains, matchSubdomains));
    }

    /**
     * Test whether a URL matches a domain in the set of domains.
     * @param {string} url - The URL to test.
     */
    testUrl(url) {
        return this.regExp.test(url);
    }
}

/**
 * Generate a regular expression string for matching a URL against a set of domains.
 * Will match http and https protocols. Currently case sensitive.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string} A regular expression string.
 */
export function createUrlRegexString(domains, matchSubdomains = true) {
    var urlMatchRE = "^(?:http|https)://" + (matchSubdomains ? "(?:[A-Za-z0-9\\-]+\\.)*" : "") + "(?:";
    for (const domain of domains)
        urlMatchRE = urlMatchRE + domain.replace(/\./g, "\\.") + "|";
    urlMatchRE = urlMatchRE.substring(0, urlMatchRE.length - 1) + ")(?:$|/.*)";
    return urlMatchRE;
}

/**
 * Generate an array of match patterns for matching a URL against a set of domains.
 * Will match http and https protocols.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string[]} An array of match patterns.
 */
export function createUrlMatchPatternArray(domains, matchSubdomains = true) {
    var matchPatterns = [ ];
    for (const domain of domains) {
        matchPatterns.push("http://" + ( matchSubdomains ? "*." : "" ) + domain + "/*");
        matchPatterns.push("https://" + ( matchSubdomains ? "*." : "" ) + domain + "/*");
    }
    return matchPatterns;
}

/**
 * Remove url parameters from a given url.
 * @param {string} url - the url to normalize
 * @returns {string} - url with parameters stripped
 */
export function removeUrlParams(url) {
    if (url.includes("?")) {
        return url.substring(0, url.indexOf("?"));
    }
    return url;
}

/**
 * Remove a leading http:// or https:// from a url.
 * @param {string} url - the url from which to strip http(s)
 * @returns {string} - the url with http(s):// removed
 */
export function removeHttps(url) {
    return url.replace("http://", "").replace("https://", "");
}

/**
 * Remove both url parameters and http(s):// from a url.
 * @param {string} url - the url to strip
 * @returns {string} - the url with parameters and http(s):// removed
 */
export function stripUrl(url) {
    return removeHttps(removeUrlParams(url));
}

/**
 * Check whether two urls match based only on host and path.
 * @param {string} url1 - first url
 * @param {string} url2 - second url to match against the first
 * @returns {Boolean} - whether the two urls match on host and path
 */
export function approxMatchUrl(url1, url2) {
    var url1Object = new URL(url1);
    var url2Object = new URL(url2);
    return (url1Object.hostname == url2Object.hostname &&
            url1Object.pathname == url2Object.pathname);
}