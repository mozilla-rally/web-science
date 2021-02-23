/**
 * This module provides utilities for matching URLs against domain names.
 *
 * @module WebScience.Utilities.Matching
 */

/**
 * An internal object that represents a parsed match pattern.
 * @typedef {Object} ParsedMatchPattern
 * @property {boolean} allUrls - Whether the match pattern is the special all URLs match pattern.
 * @property {string} scheme - The scheme for the match pattern. Must be one of: "http", "https", "ws", 
 * wss", "file", "ftp", "data", "file", or "*". The special wildcard value "*" matches "http", "https",
 * "ws", or "wss".                            
 * @property {boolean} matchSubdomains - If this scheme involves a hostname, and the hostname is not the
 * special wildcard value, whether to match any subdomains of the domain.
 * @property {boolean} host - If this scheme involves a hostname, either the hostname for the match pattern
 * or the special wildcard value "*" that matches all domains.
 * @property {string} path - The path for the match pattern. The special wildcard value "/*" matches all
 * paths.
 * @see {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns}
 */

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
const permittedMatchPatternSchemes = new Set(["*", "http", "https", "ws", "wss", "file", "ftp", "data", "file"]);

/**
 * A Set of URL schemes that require a host locator (i.e., are followed by `://` rather than `:`).
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/MatchPattern.cpp}
 * @constant
 * @type {Set<string>}
 */
const hostLocatorMatchPatternSchemes = new Set(["*", "http", "https", "ws", "wss", "file", "ftp", "moz-extension", "chrome", "resource", "moz", "moz-icon", "moz-gio"]);

/**
 * A regular expression string for the special "<all_urls>" wildcard match pattern, which matches
 * "http", "https", "ws", "wss", "ftp", "file", and "data" schemes with any hostname and path.
 * This regular expression includes a little sanity checking: hostnames are limited to alphanumerics,
 * hyphen, period, and brackets at the start and end (for IPv6 literals).
 * @constant
 * @type {string}
 */
const allUrlsRegExpString = "^(?:(?:(?:https?)|(?:wss?)|(?:ftp))://[?[a-zA-Z0-9\\-\\.]+\\]?(?::[0-9]+)?(?:(?:)|(?:/.*))|(?:file:///.*)|(?:data:.*)$";

/**
 * Parses a match pattern string into an object that represents the match pattern. We use this internal,
 * intermediate representation to enable constructing efficient matching objects. The parsing logic is
 * nearly identical to the parsing logic in Firefox.
 * @throws {Throws an error if the match pattern is not valid.}
 * @param {string} matchPattern - The match pattern string.
 * @returns {ParsedMatchPattern} - The parsed match pattern.
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/MatchPattern.cpp}
 * @private
 */
function parseMatchPattern(matchPattern) {
    if(!matchPatternValidationRegExp.test(matchPattern))
        throw new Error(`Invalid match pattern: ${matchPattern}`);

    const parsedMatchPattern = {
        allUrls: false,
        scheme: "",
        matchSubdomains: false,
        host: "",
        path: ""
    };
    
    let tail = matchPattern.repeat(1);

    if(matchPattern === "<all_urls>") {
        parsedMatchPattern.allUrls = true;
        return parsedMatchPattern;
    }

    // Parse the scheme
    let index = matchPattern.indexOf(":");
    if(index <= 0)
        throw new Error(`Invalid match pattern: ${matchPattern}`);
    const scheme = matchPattern.substr(0, index);
    if(!permittedMatchPatternSchemes.has(scheme))
        throw new Error(`Invalid match pattern: ${matchPattern}`);
    const hostLocatorScheme = hostLocatorMatchPatternSchemes.has(scheme);
    parsedMatchPattern.scheme = scheme;

    // Parse the host
    let offset = index + 1;
    tail = matchPattern.substr(offset);
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

        if(host !== "*") {
            if(host.startsWith("*.")) {
                host = host.substring(2);
                if(host === "*")
                    throw new Error(`Invalid match pattern: ${matchPattern}`);
                parsedMatchPattern.matchSubdomains = true;
            }
        }
        parsedMatchPattern.host = host;
    }

    // Parse the path
    const path = tail;
    if(path === "")
        throw new Error(`Invalid match pattern: ${matchPattern}`);
    parsedMatchPattern.path = path;

    return parsedMatchPattern;
}

/**
 * Converts a parsed match pattern into a regular expression string.
 * @param {ParsedMatchPattern} parsedMatchPattern - The parsed match pattern object.
 * @returns {string} - The regular expression string.
 * @private
 */
function parsedMatchPatternToRegExpString(parsedMatchPattern) {
    if(parsedMatchPattern.allUrls)
        return allUrlsRegExpString.repeat(1);
    
    // Scheme
    const hostLocatorScheme = hostLocatorMatchPatternSchemes.has(parsedMatchPattern.scheme);
    let schemeRegExpString = parsedMatchPattern.scheme;
    // The special "*" wildcard scheme should match the "http", "https", "ws", and "wss" schemes
    if(parsedMatchPattern.scheme === "*")
        schemeRegExpString = "(?:https?|wss?)";
    
    // Host
    let hostRegExpString = "";
    if(hostLocatorScheme) {
        // The special "*" wildcard host should match any valid hostname
        // This isn't a robust check, just limiting to permitted characters and IPv6 literal brackets
        if(parsedMatchPattern.host === "*")
            hostRegExpString = "\\[?[a-zA-Z0-9\\-\\.]+\\]?";
        else {
            hostRegExpString = escapeRegExpString(parsedMatchPattern.host);
            // The check for subdomains also isn't robust, limiting to permitted characters, no repeated
            // periods, and ending in a period
            if(parsedMatchPattern.matchSubdomains)
                hostRegExpString = "(?:[a-zA-Z0-9\\-]+\\.)*" + hostRegExpString;
            // If this is a scheme that requires "://" and isn't "file", there might be a port specified
            if(parsedMatchPattern.scheme !== "file")
                hostRegExpString = hostRegExpString + "(?::[0-9]+)?";
        }
    }

    // Path
    // TODO: implement support for query strings and fragments
    let pathRegExpString = "";
    // If the path is / or /*, allow a URL with no path specified to match
    if(parsedMatchPattern.path === "/" )
        pathRegExpString = "/?";
    else if(parsedMatchPattern.path === "/*")
        pathRegExpString = "(?:/.*)?";
    else {
        const escapedPathArray = [ ];
        for(const c of parsedMatchPattern.path) {
            if(c === "*")
                escapedPathArray.push(".*");
            else
                escapedPathArray.push(escapeRegExpString(c))
        }
        pathRegExpString = escapedPathArray.join("");
    }
    return "^" + schemeRegExpString + (hostLocatorScheme ? "://" : ":") + hostRegExpString + pathRegExpString + "$";
}

/**
 * Converts a match pattern into a regular expression string.
 * @throws {Throws an error if the match pattern is not valid.}
 * @param {string} matchPattern - The match pattern.
 * @returns {string} The regular expression.
 */
export function matchPatternToRegExpString(matchPattern) {
    const parsedMatchPattern = parseMatchPattern(matchPattern);
    return parsedMatchPatternToRegExpString(parsedMatchPattern);
}

// TODO: remove the legacy createUrlRegexString function, which is superseded by
// the domainsToRegExpString function and only used in LinkExposure
/**
 * Generate a regular expression string for matching a URL against a set of domains.
 * Will match http and https protocols. Currently case sensitive.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string} A regular expression string.
 */
export function createUrlRegexString(domains, matchSubdomains = true) {
    let urlMatchRE = "^(?:https?)://" + (matchSubdomains ? "(?:[A-Za-z0-9\\-]+\\.)*" : "") + "(?:";
    for (const domain of domains)
        urlMatchRE = urlMatchRE + domain.replace(/\./g, "\\.") + "|";
    urlMatchRE = urlMatchRE.substring(0, urlMatchRE.length - 1) + ")(?:$|(/|\\?).*)";
    return urlMatchRE;
}

/**
 * Combines an array of regular expression strings into one regular expression string, encapsulated as
 * a non-capturing group, where each input string is an alternative.
 * @param {string[]} regExpStrings - An array of regular expression strings.
 */
function combineRegExpStrings(regExpStrings) {
    if(regExpStrings.length === 1)
        return "(?:" + regExpStrings[0] + ")";
    return "(?:" + (regExpStrings.map((regExpString) => { return `(?:${regExpString})`; })).join("|") + ")";
}

/**
 * Converts an array of match patterns into a regular expression string.
 * @throws {Throws an error if a match pattern is not valid.}
 * @param {Array<string>} matchPatterns - The match patterns.
 * @param {boolean} optimize - Whether to attempt to optimize the regular
 * expression string, by minimizing backtracking.
 * @returns {string} The regular expression.
 */
export function matchPatternsToRegExpString(matchPatterns, optimize = true) {
    // Without optimization, just generate the individual regular expression strings
    // and combine them as alternatives
    // This approach is perfectly fine for a small number of match patterns, but performance
    // degrades when there are a large number of match patterns that include subdomain matching
    if(!optimize) {
        const regExpArray = [ ];
        for(const matchPattern of matchPatterns)
            regExpArray.push("(?:" + matchPatternToRegExpString(matchPattern) + ")");
        return regExpArray.join("|");
    }

    // With optimization, parse the match patterns into intermediate representations,
    // insert them into a data structure that combines prefixes to minimize backtracking,
    // then generate regular expression strings and combine them as alternatives
    // Effectively, we are creating an automaton based on a directed acyclic graph, then
    // converting that automaton into a regular expression string with depth-first search
    const schemeMap = new Map();
    const regExpStrings = [ ];
    for(const matchPattern of matchPatterns) {
        const parsedMatchPattern = parseMatchPattern(matchPattern);
        if(parsedMatchPattern.allUrls)
            regExpStrings.append(allUrlsRegExpString);
        // Not currently optimizing match patterns with a non-host scheme
        else if(!hostLocatorMatchPatternSchemes.has(parsedMatchPattern.scheme))
            regExpStrings.append(parsedMatchPatternToRegExpString(parsedMatchPattern));
        else {
            // In this data structure of nested maps, the first level is the scheme, the next
            // level is whether to match subdomains, the next level is the host, and the final
            // level is the path
            let matchSubdomainsMap = schemeMap.get(parsedMatchPattern.scheme);
            if(matchSubdomainsMap === undefined) {
                matchSubdomainsMap = new Map();
                schemeMap.set(parsedMatchPattern.scheme, matchSubdomainsMap);
            }
            let hostMap = matchSubdomainsMap.get(parsedMatchPattern.matchSubdomains);
            if(hostMap === undefined) {
                hostMap = new Map();
                matchSubdomainsMap.set(parsedMatchPattern.matchSubdomains, hostMap);
            }
            let pathSet = hostMap.get(parsedMatchPattern.host);
            if(pathSet === undefined) {
                pathSet = new Set();
                hostMap.set(parsedMatchPattern.host, pathSet);
            }
            pathSet.add(parsedMatchPattern.path);
        }
    }

    // Convert the data structure into regular expression strings 
    const schemeRegExpStrings = [ ];
    for(const [scheme, matchSubdomainsMap] of schemeMap) {
        let schemeRegExpString = scheme; 
        // The special "*" wildcard scheme should match the "http", "https", "ws", and "wss" schemes
        if(scheme === "*")
            schemeRegExpString = "(?:https?|wss?)";
        
        const matchSubdomainsRegExpStrings = [ ];
        for(const [matchSubdomains, hostMap] of matchSubdomainsMap) {
            let matchSubdomainsRegExpString = "";
            if(matchSubdomains)
                matchSubdomainsRegExpString = "(?:[a-zA-Z0-9\\-]+\\.)*";
            
            const hostRegExpStrings = [ ];
            for(const [host, pathSet] of hostMap) {
                let hostRegExpString = "";
                if(host === "*")
                    hostRegExpString = "\\[?[a-zA-Z0-9\\-\\.]+\\]?";
                else {
                    hostRegExpString = escapeRegExpString(host);
                    // If this is a scheme that requires "://" and isn't "file", there might be a port specified
                    //if(scheme !== "file")
                    //    hostRegExpString = hostRegExpString + "(?::[0-9]+)?";
                }
                const pathRegExpStrings = [ ];
                for(const path of pathSet) {
                    let pathRegExpString = "";
                    // If the path is / or /*, allow a URL with no path specified to match
                    if(path === "/" )
                        pathRegExpString = "/?";
                    else if(path === "/*")
                        pathRegExpString = "(?:/.*)?";
                    else {
                        const escapedPathArray = [ ];
                        for(const c of path) {
                            if(c === "*")
                                escapedPathArray.push(".*");
                            else
                                escapedPathArray.push(escapeRegExpString(c))
                        }
                        pathRegExpString = escapedPathArray.join("");
                    }
                    pathRegExpStrings.push(pathRegExpString);
                }
                hostRegExpStrings.push(hostRegExpString + combineRegExpStrings(pathRegExpStrings))
            }
            matchSubdomainsRegExpStrings.push(matchSubdomainsRegExpString + combineRegExpStrings(hostRegExpStrings));
        }
        schemeRegExpStrings.push(schemeRegExpString + "://" + combineRegExpStrings(matchSubdomainsRegExpStrings));
    }

    const combinedRegExpStrings = ["^" + combineRegExpStrings(schemeRegExpStrings) + "$"].concat(regExpStrings); 

    return combineRegExpStrings(combinedRegExpStrings);
}

/**
 * Converts an array of match patterns into a RegExp object.
 * @throws {Throws an error if a match pattern is not valid.}
 * @param {Array<string>} matchPatterns - The match patterns.
 * @param {boolean} optimize - Whether to attempt to optimize the regular
 * expression string, by minimizing backtracking.
 * @returns {RegExp} The regular expression RegExp object.
 */
export function matchPatternsToRegExp(matchPatterns, optimize) {
    return new RegExp(matchPatternsToRegExpString(matchPatterns, optimize), "i");
}

// TODO: remove the legacy UrlMatcher class, which is only used in the SocialMediaLinkSharing module
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
        //this.regExp = new RegExp(domains, "i");
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
 * Generate a set of match patterns for a set of domains. The match patterns will use the special
 * "*" wildcard scheme (matching "http", "https", "ws", and "wss") and the special "/*" wildcard
 * path (matching any path).
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string[]} Match patterns for the domains in the set.
 */
export function domainsToMatchPatterns(domains, matchSubdomains = true) {
    const matchPatterns = [ ];
    for (const domain of domains)
        matchPatterns.push(`*://${matchSubdomains ? "*." : ""}${domain}/*`);
    return matchPatterns;
}

/**
 * Generate a regular expression string for a set of domains. The regular expression is based on
 * match patterns generated by `domainsToMatchPatterns` and has the same matching properties.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string} A regular expression string for matching a URL against the set of domains.
 */
export function domainsToRegExpString(domains, matchSubdomains = true) {
    const matchPatterns = domainsToMatchPatterns(domains, matchSubdomains);
    return matchPatternsToRegExpString(matchPatterns);
}

/**
 * Generate a RegExp object for matching a URL against a set of domains. The regular expression
 * is based on match patterns generated by `domainsToMatchPatterns` and has the same matching
 * properties.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {RegExp} A RegExp object for matching a URL against the set of domains.
 */
export function domainsToRegExp(domains, matchSubdomains = true) {
    return new RegExp(domainsToRegExpString(domains, matchSubdomains), "i");
}

// TODO: remove the legacy createUrlMatchPatternArray function, which is superseded by
// the domainsToMatchPatterns function and only used in EventHandling
/**
 * Generate an array of match patterns for matching a URL against a set of domains.
 * Will match http and https protocols.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string[]} An array of match patterns.
 */
export function createUrlMatchPatternArray(domains, matchSubdomains = true) {
    const matchPatterns = [ ];
    for (const domain of domains) {
        //matchPatterns.push("*://" + ( matchSubdomains ? "*." : "" ) + domain + "/*");
        matchPatterns.push("http://" + ( matchSubdomains ? "*." : "" ) + domain + "/*");
        matchPatterns.push("https://" + ( matchSubdomains ? "*." : "" ) + domain + "/*");
    }
    return matchPatterns;
}

/**
 * Normalize a URL string to only the protocol (using HTTPS if no protocol is specified), hostname, and path.
 * The normalized URL does not include any query string or fragment.
 * @param {string} url - The URL string to normalize.
 * @return {string} The normalized URL string.
 */
export function normalizeUrl(url) {
    const urlObj = new URL(url);
    const normalizedUrl = (urlObj.protocol ? urlObj.protocol : "https:") +
                        "//" + urlObj.hostname +
                        (urlObj.pathname ? urlObj.pathname : "");
    return normalizedUrl;
}
