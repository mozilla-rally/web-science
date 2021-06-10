/**
 * This module provides utilities for matching URLs against criteria.
 *
 * ## Matching Criteria
 * The module supports two types of criteria:
 *   * Match Patterns (preferred) - a syntax used in the WebExtensions API for expressing possible URL matches.
 *     See: {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns}.
 *   * Domains - a simple list of domain names, which are converted into match patterns.
 * 
 * ## Matching Output
 * The module supports three types of output for matching URLs:
 *   * Match Pattern Sets (preferred) - optimized objects that compare a URL against the criteria.
 *   * Regular Expressions - `RegExp` objects that compare a URL against the criteria.
 *   * Regular Expression Strings - strings expressing regular expressions for comparing a URL against the criteria.
 * 
 * ## Implementation Notes
 * We use Rollup pure annotations (`@__PURE__` comments) because Rollup assumes that iterators might have side 
 * effects (including subtle cases of iteration like `Array.map` and `Array.join`). Without the annotations, Rollup
 * would mark arguments for many of this module's functions (which might be large string arrays) as tainted by side
 * effects and always include those arguments in bundled output. The pure annotations are associated with either
 * iteration functions or class instantiation to provide clarity about why they're needed.
 *
 * @see {@link https://github.com/rollup/rollup/issues/3127}
 * 
 * @module matching
 */

/**
 * A RegExp for validating WebExtensions match patterns, using the same regular expressions for manifest
 * validation as Firefox.
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/schemas/manifest.json}
 * @constant
 * @type {RegExp}
 * @private
 */
const matchPatternValidationRegExp = new RegExp("(^<all_urls>$)|(^(https?|wss?|file|ftp|\\*)://(\\*|\\*\\.[^*/]+|[^*/]+)/.*$)|(^file:///.*$)|(^resource://(\\*|\\*\\.[^*/]+|[^*/]+)/.*$|^about:|^data:)", "i");

/**
 * A Set of URL schemes permitted in WebExtensions match patterns.
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/MatchPattern.cpp}
 * @constant {Set<string>}
 * @private
 */
const permittedMatchPatternSchemes = new Set(["*", "http", "https", "ws", "wss", "file", "ftp", "data", "file"]);

/**
 * A Set of URL schemes that require a host locator (i.e., are followed by `://` rather than `:`).
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/MatchPattern.cpp}
 * @constant {Set<string>}
 * @private
 */
const hostLocatorMatchPatternSchemes = new Set(["*", "http", "https", "ws", "wss", "file", "ftp", "moz-extension", "chrome", "resource", "moz", "moz-icon", "moz-gio"]);

/**
 * A regular expression string for the special "<all_urls>" wildcard match pattern, which matches
 * "http", "https", "ws", "wss", "ftp", "file", and "data" schemes with any hostname and path.
 * This regular expression includes a little sanity checking: hostnames are limited to alphanumerics,
 * hyphen, period, and brackets at the start and end (for IPv6 literals).
 * @constant {string}
 * @private
 */
const allUrlsRegExpString = "^(?:(?:(?:https?)|(?:wss?)|(?:ftp))://[?[a-zA-Z0-9\\-\\.]+\\]?(?::[0-9]+)?(?:(?:)|(?:/.*)))|(?:file://[?[a-zA-Z0-9\\-\\.]*\\]?/.*)|(?:data:.*)$";

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
 * @private
 */

/**
 * Parses a match pattern string into an object that represents the match pattern. We use this internal,
 * intermediate representation to enable constructing efficient matching objects. The parsing logic is
 * nearly identical to the parsing logic in Firefox.
 * @throws {Error} Throws an error if the match pattern is not valid.
 * @param {string} matchPattern - The match pattern string.
 * @returns {ParsedMatchPattern} - The parsed match pattern.
 * @see {@link https://searchfox.org/mozilla-central/source/toolkit/components/extensions/MatchPattern.cpp}
 * @private
 */
function parseMatchPattern(matchPattern) {
    if(!matchPatternValidationRegExp.test(matchPattern))
        throw new Error(`Invalid match pattern, failed validation: ${matchPattern}`);

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
    if(index <= 0) {
        throw new Error(`Invalid match pattern, missing : after scheme: ${matchPattern}`);
    }
    const scheme = matchPattern.substr(0, index);
    if(!permittedMatchPatternSchemes.has(scheme)) {
        throw new Error(`Invalid match pattern, unsupported scheme: ${matchPattern}`);
    }
    const hostLocatorScheme = hostLocatorMatchPatternSchemes.has(scheme);
    parsedMatchPattern.scheme = scheme;

    // Parse the host
    let offset = index + 1;
    tail = matchPattern.substr(offset);
    if(hostLocatorScheme) {
        if(!tail.startsWith("//")) {
            throw new Error(`Invalid match pattern, missing // required by scheme: ${matchPattern}`);
        }

        offset += 2;
        tail = matchPattern.substr(offset);
        index = tail.indexOf("/");
        if(index < 0) {
            index = tail.length;
        }

        let host = tail.substring(0, index);
        if((host === "") && (scheme !== "file")) {
            throw new Error(`Invalid match pattern, missing host required by scheme: ${matchPattern}`);
        }

        offset += index;
        tail = matchPattern.substring(offset);

        if(host !== "*") {
            if(host.startsWith("*.")) {
                host = host.substring(2);
                if(host === "*") {
                    throw new Error(`Invalid match pattern, subdomain wildcard with host wildcard: ${matchPattern}`);
                }
                parsedMatchPattern.matchSubdomains = true;
            }
        }
        parsedMatchPattern.host = host;
    }

    // Parse the path
    const path = tail;
    if(path === "") {
        throw new Error(`Invalid match pattern, missing path: ${matchPattern}`);
    }
    parsedMatchPattern.path = path;

    return parsedMatchPattern;
}

/**
 * Create a new MatchPatternSet for matching a set of match patterns.
 * @param {string[]} matchPatterns - An array of match pattern strings.
 * @returns {MatchPatternSet} - The new MatchPatternSet.
 */
export function createMatchPatternSet(matchPatterns) {
    return /*@__PURE__*/new MatchPatternSet(matchPatterns);
}

/**
 * Restore a MatchPatternSet that was serialized to an object with
 * the `export` function.
 * @param {Object} exportedMatchPatternSet - A serialized MatchPatternSet.
 * @returns {MatchPatternSet} - The new MatchPatternSet.
 * @example <caption>Example usage of import.</caption>
 * const matchPatternSet1 = webScience.matching.createMatchPatternSet([ "*://example.com/*" ]);
 * const exportedMatchPatternSet = matchPatternSet.export();
 * const matchPatternSet2 = webScience.matching.importMatchPatternSet(exportedMatchPatternSet);
 */
export function importMatchPatternSet(exportedMatchPatternSet) {
    const matchPatternSet = new MatchPatternSet([]);
    matchPatternSet.import(exportedMatchPatternSet);
    return matchPatternSet;
}

/**
 * An optimized object for matching against match patterns. A `MatchPatternSet` can provide
 * a significant performance improvement in comparison to `RegExp`s, in some instances
 * greater than 100x. A `MatchPatternSet` can also be exported to an object that uses only
 * built-in types, so it can be persisted or passed to content scripts in extension storage.
 *
 * There are several key optimizations in `MatchPatternSet`:
 *   * URLs are parsed with the `URL` class, which has native implementation.
 *   * Match patterns are indexed by hostname in a hash map. Lookups are much faster than
 *     iteratively advancing and backtracking through a complex regular expression, which
 *     is how domain matching currently occurs with the `Irregexp` regular expression
 *     engine in Firefox and Chrome.
 *   * Match patterns with identical scheme, subdomain matching, and host (i.e., that
 *     differ only in path) are combined.
 *   * The only remaining use of regular expressions is in path matching, where expressions
 *     can be (relatively) uncomplicated.
 *
 * Future performance improvements could include:
 *   * Replacing the path matching implementation to eliminate regular expressions entirely.
 *   * Replacing the match pattern index, such as by implementing a trie.
 * @hideconstructor
 */
class MatchPatternSet {
    /**
     * Creates a match pattern set from an array of match patterns.
     * @param {string[]} matchPatterns - The match patterns for the set.
     */
    constructor(matchPatterns) {
        // Defining the special sets of `<all_url>` and wildcard schemes inside the class so
        // keeping content scripts in sync with this implementation will be easier
        this.allUrls = false;
        this.allUrlsSchemeSet = new Set(["http", "https", "ws", "wss", "ftp", "file", "data"]);
        this.wildcardSchemeSet = new Set(["http", "https", "ws", "wss"]);
        this.patternsByHost = { };
        for(const matchPattern of matchPatterns) {
            const parsedMatchPattern = parseMatchPattern(matchPattern);
            if(parsedMatchPattern.allUrls)
                this.allUrls = true;
            else {
                let hostPatterns = this.patternsByHost[parsedMatchPattern.host];
                if(hostPatterns === undefined) {
                    hostPatterns = [ ];
                    this.patternsByHost[parsedMatchPattern.host] = hostPatterns;
                }
                let addedToHostPattern = false;
                for(const hostPattern of hostPatterns) {
                    if((hostPattern.scheme === parsedMatchPattern.scheme) && (hostPattern.matchSubdomains === parsedMatchPattern.matchSubdomains)) {
                        addedToHostPattern = true;
                        hostPattern.paths.push(parsedMatchPattern.path);
                        break;
                    }
                }
                if(!addedToHostPattern)
                    hostPatterns.push({
                        scheme: parsedMatchPattern.scheme,
                        matchSubdomains: parsedMatchPattern.matchSubdomains,
                        host: parsedMatchPattern.host,
                        paths: [ parsedMatchPattern.path ]
                    });
            }
        }

        for(const host of Object.keys(this.patternsByHost)) {
            const hostPatterns = this.patternsByHost[host];
            for(const hostPattern of hostPatterns) {
                let wildcardPath = false;
                const pathRegExps = hostPattern.paths.map(path => {
                    if(path === "/")
                        return "/";
                    else if(path === "/*") {
                        wildcardPath = true;
                        return "/.*";
                    }
                    else {
                        // Including regular expression special character escaping in
                        // the constructor so keeping content scripts in sync with this
                        // implementation will be easier
                        const escapedPathArray = [ ];
                        for(const c of path) {
                            if(c === "*")
                                escapedPathArray.push(".*");
                            else
                                escapedPathArray.push(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
                        }
                        return escapedPathArray.join("");
                    }
                });
                if(wildcardPath) {
                    hostPattern.wildcardPath = true;
                }
                else {
                    hostPattern.wildcardPath = false;
                    hostPattern.pathRegExp = new RegExp("^(?:" + pathRegExps.join("|") + ")$");
                }
                delete hostPattern.paths;
            }
        }
    }

    /**
     * Compares a URL string to the match patterns in the set.
     * @param {string} url - The URL string to compare.
     * @returns {boolean} Whether the URL string matches a pattern in the set.
     */
    matches(url) {
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            // If the target isn't a true URL, it certainly doesn't match
            return false;
        }
        // Remove the trailing : from the parsed protocol
        const scheme = parsedUrl.protocol.substring(0, parsedUrl.protocol.length - 1);
        const host = parsedUrl.hostname;
        const path = parsedUrl.pathname;

        // Check the special `<all_urls>` match pattern
        if(this.allUrls && this.allUrlsSchemeSet.has(scheme)) {
            return true;
        }

        // Identify candidate match patterns
        let candidatePatterns = [ ];
        // Check each component suffix of the hostname for candidate match patterns
        const hostComponents = parsedUrl.hostname.split(".");
        let hostSuffix = "";
        for(let i = hostComponents.length - 1; i >= 0; i--) {
            hostSuffix = hostComponents[i] + (i < hostComponents.length - 1 ? "." : "") + hostSuffix;
            const hostSuffixPatterns = this.patternsByHost[hostSuffix];
            if(hostSuffixPatterns !== undefined) {
                candidatePatterns = candidatePatterns.concat(hostSuffixPatterns);
            }
        }

        // Add match patterns with a wildcard host to the set of candidates
        const hostWildcardPatterns = this.patternsByHost["*"];
        if(hostWildcardPatterns !== undefined)
            candidatePatterns = candidatePatterns.concat(hostWildcardPatterns);

        // Check the scheme, then the host, then the path for a match
        for(const candidatePattern of candidatePatterns) {
            if((candidatePattern.scheme === scheme) ||
               ((candidatePattern.scheme === "*") && this.wildcardSchemeSet.has(scheme))) {
                if(candidatePattern.matchSubdomains ||
                   (candidatePattern.host === "*") ||
                   (candidatePattern.host === host)) {
                    if(candidatePattern.wildcardPath ||
                       candidatePattern.pathRegExp.test(path)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Serializes the internals of the match pattern set to a serializable object, for purposes
     * of saving to extension local storage or messaging across contexts.
     * @returns {Object} - An opaque serializable object representing the match pattern set
     * internals.
     */
    export() {
        return {
            allUrls: this.allUrls,
            patternsByHost: this.patternsByHost
        };
    }

    /**
     * Imports the match pattern set from an opaque object previously generated by `export`.
     * @param {exportedInternals} - The previously exported internals for the match pattern set.
     * @private
     */
    import(exportedInternals) {
        this.allUrls = exportedInternals.allUrls;
        this.patternsByHost = exportedInternals.patternsByHost;
    }
}

/**
 * Escapes regular expression special characters in a string.
 * @param {string} string - The input string.
 * @returns {string} The input string with regular expression special characters escaped.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions}
 */
export function escapeRegExpString(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    // Allow arbitrary parameters or an arbitrary fragment identifier
    pathRegExpString += "(?:\\?.*)?(?:#.*)?";
    return "^" + schemeRegExpString + (hostLocatorScheme ? "://" : ":") + hostRegExpString + pathRegExpString + "$";
}

/**
 * Converts a match pattern into a regular expression string.
 * @throws {Error} Throws an error if the match pattern is not valid.
 * @param {string} matchPattern - The match pattern.
 * @returns {string} The regular expression.
 * @private
 */
function matchPatternToRegExpString(matchPattern) {
    return parsedMatchPatternToRegExpString(parseMatchPattern(matchPattern));
}

/**
 * Combines an array of regular expression strings into one regular expression string, encapsulated as
 * a non-capturing group, where each input string is an alternative.
 * @param {string[]} regExpStrings - An array of regular expression strings.
 * @private
 */
function combineRegExpStrings(regExpStrings) {
    return "(?:" + /*@__PURE__*/(/*@__PURE__*/regExpStrings.map((regExpString) => { return regExpStrings.length > 1 ? `(?:${regExpString})` : regExpString; })).join("|") + ")";
}

/**
 * Converts an array of match patterns into a regular expression string.
 * @throws {Error} Throws an error if a match pattern is not valid.
 * @param {string[]} matchPatterns - The match patterns.
 * @returns {string} The regular expression string.
 */
export function matchPatternsToRegExpString(matchPatterns) {
    return combineRegExpStrings(/*@__PURE__*/matchPatterns.map(matchPattern => { return matchPatternToRegExpString(matchPattern); }));
}

/**
 * Converts an array of match patterns into a RegExp object.
 * @throws {Error} Throws an error if a match pattern is not valid.
 * @param {string[]} matchPatterns - The match patterns.
 * @returns {RegExp} The regular expression RegExp object.
 */
export function matchPatternsToRegExp(matchPatterns) {
    // Set the entire regular expression to case insensitive, because JavaScript regular expressions
    // do not (currently) support partial case insensitivity
    return new RegExp(matchPatternsToRegExpString(matchPatterns), "i");
}

/**
 * Generates a set of match patterns for a set of domains. The match patterns will use the special
 * "\*" wildcard scheme (matching "http", "https", "ws", and "wss") and the special "/*" wildcard
 * path (matching any path).
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string[]} Match patterns for the domains in the set.
 */
export function domainsToMatchPatterns(domains, matchSubdomains = true) {
    return /*@__PURE__*/domains.map(domain => { return `*://${matchSubdomains ? "*." : ""}${domain}/*` });
}

/**
 * Generates a regular expression string for a set of domains. The regular expression is based on
 * match patterns generated by `domainsToMatchPatterns` and has the same matching properties.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {string} A regular expression string for matching a URL against the set of domains.
 */
export function domainsToRegExpString(domains, matchSubdomains = true) {
    return matchPatternsToRegExpString(domainsToMatchPatterns(domains, matchSubdomains));
}

/**
 * Generates a RegExp object for matching a URL against a set of domains. The regular expression
 * is based on match patterns generated by `domainsToMatchPatterns` and has the same matching
 * properties.
 * @param {string[]} domains - The set of domains to match against.
 * @param {boolean} [matchSubdomains=true] - Whether to match subdomains of domains in the set.
 * @returns {RegExp} A RegExp object for matching a URL against the set of domains.
 */
export function domainsToRegExp(domains, matchSubdomains = true) {
    // Set the entire regular expression to case insensitive, because JavaScript regular expressions
    // do not (currently) support partial case insensitivity
    return new RegExp(domainsToRegExpString(domains, matchSubdomains), "i");
}

/**
 * Normalizes a URL string for subsequent comparison. Normalization includes the following steps:
 *   * Parse the string as a `URL` object, which will (among other normalization) lowercase the
 *     scheme and hostname.
 *   * Remove the port number, if any. For example, https://www.mozilla.org:443/ becomes https://www.mozilla.org/.
 *   * Remove query parameters, if any. For example, https://www.mozilla.org/?foo becomes https://www.mozilla.org/.
 *   * Remove the fragment identifier, if any. For example, https://www.mozilla.org/#foo becomes https://www.mozilla.org/.
 * @param {string} url - The URL string to normalize.
 * @returns {string} The normalized URL string.
 * @throws {Error} Throws an error if the URL string is not a valid, absolute URL.
 */
export function normalizeUrl(url) {
    const urlObj = new URL(url);
    urlObj.port = "";
    urlObj.search = "";
    urlObj.hash = "";
    return urlObj.href;
}
