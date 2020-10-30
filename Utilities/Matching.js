/**
 * This module provides utilities for matching URLs against domain names.
 * 
 * @module WebScience.Utilities.Matching
 */
import { destinationDomains } from "../../study/paths/destinationDomains.js"
import { referrerDomains } from "../../study/paths/referrerDomains.js"
import { fbPages } from "../../study/paths/pages-fb.js"
import { ytPages } from "../../study/paths/pages-yt.js"
//import { twPages } from "../../study/paths/pages-tw.js"  // no twitter handles yet

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
        this.regExp = new RegExp(createUrlRegexString(domains, matchSubdomains), "i");
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
    urlMatchRE = urlMatchRE.substring(0, urlMatchRE.length - 1) + ")(?:$|(/|\\?).*)";  ")(?:$|/.*)";
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

export function getStudyPaths() {
    var studyPaths = {};
    studyPaths.domains = new UrlMatcher(destinationDomains);
    studyPaths.referrerOnlyDomains = new UrlMatcher(referrerDomains);
    studyPaths.paths = {}
    studyPaths.paths.fb = {
        regex: /(facebook.com\/pages\/[0-9|a-z|A-Z|-]*\/[0-9]*(\/|$))|(facebook\.com\/[0-9|a-z|A-Z|.]*(\/|$))/i,
        pages: new UrlMatcher(fbPages)
    };
    studyPaths.paths.yt = {
        regex: /(youtube.com\/(user|channel)\/[0-9|a-z|A-Z|_|-]*(\/videos)?)(\/|$)|(youtube\.com\/[0-9|A-Z|a-z]*)(\/|$)|(youtube\.com\/profile\?user=[0-9|A-Z|a-z]*)(\/|$)/i,
        pages: new UrlMatcher(ytPages)
    };
    /*
    studyPaths.paths.tw = {
        regex: /(twitter\.com\/[0-9|a-z|A-Z|_]*(\/|$))/,
        pages: new UrlMatcher(twPages)
    };
    */
    studyPaths.destinationPaths = destinationDomains.concat(fbPages).concat(ytPages)/*.concat(twPages);*/
    return studyPaths;
}

