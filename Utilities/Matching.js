/**
 * This module provides utilities for matching URLs against domain names.
 * 
 * @module WebScience.Utilities.Matching
 */
import { destinationDomains } from "../../study/paths/destinationDomains.js"
import { referrerDomains } from "../../study/paths/referrerDomains.js"
import { fbPages } from "../../study/paths/pages-fb.js"
import { ytPages } from "../../study/paths/pages-yt.js"
import { twPages } from "../../study/paths/pages-tw.js"

/**
 * A function that escapes regular expression special characters in a string.
 * @param {string} string - The input string.
 * @returns {string} The input string with regular expression special characters escaped.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions}
 */
export function escapeRegExpString(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A RegExp for validating WebExtensions match patterns, using the same regular expressions for manifest
 * validation as Firefox.
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/schemas/manifest.json}
 * @constant
 * @type {RegExp}
 */
const matchPatternValidationRegExp = new RegExp("(^<all_urls>$)|(^(https?|wss?|file|ftp|\\*)://(\\*|\\*\\.[^*/]+|[^*/]+)/.*$)|(^file:///.*$)|(^resource://(\\*|\\*\\.[^*/]+|[^*/]+)/.*$|^about:)", "i");

/**
 * A Set of URL schemes permitted in WebExtensions match patterns.
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/MatchPattern.cpp}
 * @constant
 * @type {Set<string>}
 */
const permittedMatchPatternSchemes = new Set(["http", "https", "ws", "wss", "file", "ftp", "data", "file"]);

/**
 * A Set of URL schemes that require a host locator (i.e., are followed by `://` rather than `:`).
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/MatchPattern.cpp}
 * @constant
 * @type {Set<string>}
 */
const hostLocatorMatchPatternSchemes = new Set(["http", "https", "ws", "wss", "file", "ftp", "moz-extension", "chrome", "resource", "moz", "moz-icon", "moz-gio"]);

/**
 * Converts a match pattern into a regular expression string, using the same logic
 * for match pattern parsing as Firefox.
 * @throws {Throws an error if the match pattern is not valid.}
 * @param {string} matchPattern - The match pattern.
 * @returns {string} The regular expression.
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/MatchPattern.cpp}
 */
export function matchPatternToRegExpString(matchPattern) {
    if(!matchPatternValidationRegExp.test(matchPattern))
        throw new Error(`Invalid match pattern: ${matchPattern}`);
    
    let tail = matchPattern.repeat(1);

    // The special "<all_urls>" match pattern should match the "http", "https", "ws", "wss", "ftp", "file", and "data" schemes
    // This regular expression includes a little sanity checking: domains are limited to alphanumerics, hyphen, period, and brackets at the start and end (for IPv6 literals)
    if(matchPattern === "<all_urls>")
        return "^(?:(?:(?:https?)|(?:wss?)|(?:ftp))://[?[a-zA-Z0-9\\-\\.]+\\]?(?::[0-9]+)?(?:(?:)|(?:/.*))|(?:file:///.*)|(?:data:.*)$";

    // Parse the scheme
    let index = matchPattern.indexOf(":");
    if(index <= 0)
        throw new Error(`Invalid match pattern: ${matchPattern}`);
    let scheme = matchPattern.substr(0, index);
    let hostLocatorScheme = false;
    // The special "*" wildcard scheme should match the "http", "https", "ws", and "wss" schemes
    if(scheme === "*") {
        scheme = "(?:(?:https?)|(?:wss?))";
        hostLocatorScheme = true;
    }
    else {
        if(!permittedMatchPatternSchemes.has(scheme))
            throw new Error(`Invalid match pattern: ${matchPattern}`);
        hostLocatorScheme = hostLocatorMatchPatternSchemes.has(scheme);
    }

    // Parse the host
    let offset = index + 1;
    tail = matchPattern.substr(offset);
    let escapedDomain = "";
    if(hostLocatorScheme) {
        if(!tail.startsWith("//"))
            throw new Error(`Invalid match pattern: ${matchPattern}`);
        
        offset += 2;
        tail = matchPattern.substr(offset);
        index = tail.indexOf("/");
        if(index < 0)
            index = tail.length;
        
        let host = tail.substring(0, index);
        if((host === "") && (scheme !== "file"))
            throw new Error(`Invalid match pattern: ${matchPattern}`);

        offset += index;
        tail = matchPattern.substring(offset);

        if(host === "*")
            escapedDomain = "\\[?[a-zA-Z0-9\\-\\.]+\\]?"; // This isn't a robust domain check, just limiting to permitted characters and IPv6 literal brackets

        else {
            let matchSubdomains = false;
            if(host.startsWith("*.")) {
                host = host.substring(2);
                matchSubdomains = true;
            }
            escapedDomain = escapeRegExpString(host);
            if(matchSubdomains)
                escapedDomain = "[a-zA-Z0-9\\-\\.]*" + escapedDomain;
        }

        // If this is a scheme that requires "://" and isn't "file", there might be a port specified
        if(scheme !== "file")
            escapedDomain = escapedDomain + "(?::[0-9]+)?";
    }
    
    // Parse the path
    let path = tail;
    let escapedPath = "";
    if(path === "")
        throw new Error(`Invalid match pattern: ${matchPattern}`);
    
    // If the path is / or /*, allow a URL with no path specified to match
    if(path === "/" )
        escapedPath = "/?";
    else if(path === "/*")
        escapedPath = "(?:/.*)?";
    else {
        let escapedPathArray = [ ];
        for(let c of path) {
            if(c === "*")
                escapedPathArray.push(".*");
            else
                escapedPathArray.push(escapeRegExpString(c))
        }
        escapedPath = escapedPathArray.join("");
    }

    return "^" + scheme + (hostLocatorScheme ? "://" : ":") + escapedDomain + escapedPath + "$";
}

/**
 * Converts an array of match patterns into a regular expression string.
 * @throws {Throws an error if a match pattern is not valid.}
 * @param {Array<string>} matchPatterns - The match patterns.
 * @returns {string} The regular expression.
 */
export function matchPatternsToRegExpString(matchPatterns) {
    let regExpArray = [ ];
    for(let matchPattern of matchPatterns)
        regExpArray.push("(?:" + matchPatternToRegExpString(matchPattern) + ")");
    return regExpArray.join("|");
}

/**
 * Converts an array of match patterns into a RegExp object.
 * @throws {Throws an error if a match pattern is not valid.}
 * @param {Array<string>} matchPatterns - The match patterns.
 * @returns {RegExp} The regular expression RegExp object.
 */
export function matchPatternsToRegExp(matchPatterns) {
    return new RegExp(matchPatternsToRegExpString(matchPatterns), "i");
}

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
        this.regExp = new RegExp(domainsToRegExpString(domains, matchSubdomains), "i");
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
 * Will match http and https protocols.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string} A regular expression string for matching a URL against the set of domains
 */
export function domainsToRegExpString(domains, matchSubdomains = true) {
    let matchPatterns = [ ];
    for (const domain of domains) {
        matchPatterns.push(`http://${matchSubdomains ? "*." : ""}${domain}/*`);
        matchPatterns.push(`https://${matchSubdomains ? "*." : ""}${domain}/*`);
    }
    return matchPatternsToRegExpString(matchPatterns);
}

/**
 * Generate a RegExp object for matching a URL against a set of domains.
 * Will match http and https protocols.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {RegExp} A RegExp object for matching a URL against the set of domains.
 */
export function domainsToRegExp(domains, matchSubdomains = true) {
    return new RegExp(domainsToRegExpString(domains, matchSubdomains), "i")
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
    studyPaths.paths.tw = {
        regex: /(twitter\.com\/[0-9|a-z|A-Z|_]*(\/|$))/,
        pages: new UrlMatcher(twPages)
    };
    studyPaths.destinationPaths = destinationDomains.concat(fbPages).concat(ytPages).concat(twPages);
    console.log(studyPaths);
    return studyPaths;
}

