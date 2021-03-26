/**
 * @file Script for computing aggregate statistics
 * @module WebScience.Measurements.AggregateStatistics
 */

const fbRegex = /(facebook.com\/pages\/[0-9|a-z|A-Z|-]*\/[0-9]*(\/|$))|(facebook\.com\/[0-9|a-z|A-Z|.]*(\/|$))/i;
const ytRegex = /(youtube.com\/(user|channel)\/[0-9|a-z|A-Z|_|-]*(\/videos)?)(\/|$)|(youtube\.com\/[0-9|A-Z|a-z]*)(\/|$)|(youtube\.com\/profile\?user=[0-9|A-Z|a-z]*)(\/|$)/i;
const twRegex = /(twitter\.com\/[0-9|a-z|A-Z|_]*(\/|$))/;
let referrerMatcher;
let destinationMatcher;
let fbMatcher;
let twMatcher;
let ytMatcher;

/**
 * Event handler for messages from the main thread
 * On receiving data, the function computes aggregate statistics and
 * sends a message back to the caller with the result object.
 *
 * @param {MessageEvent} event - message object
 * @listens MessageEvent
 */
onmessage = async event => {
    const data = event.data;
    const stats = {};
    const studyDomains = data.studyDomains;
    destinationMatcher = new MatchPatternSet([]);
    destinationMatcher.import(studyDomains.destinationMatches);
    referrerMatcher = new MatchPatternSet([])
    referrerMatcher.import(studyDomains.referrerMatches);
    fbMatcher = new MatchPatternSet([])
    fbMatcher.import(studyDomains.fbMatches);
    ytMatcher = new MatchPatternSet([])
    ytMatcher.import(studyDomains.ytMatches);
    twMatcher = new MatchPatternSet([])
    twMatcher.import(studyDomains.twMatches);
    Object.entries(data.fromStorage).forEach(entry => {
        const key = entry[0];
        const storageObj = entry[1];
        if (key in functionMapping) {
            const aggregrateStats = functionMapping[key](storageObj);
            stats[key] = aggregrateStats;
        }
    });
    sendMessageToCaller("stats ", stats);
}

/**
 * Error handler
 * @param {ErrorEvent} event - error object
 * @listens ErrorEvent
 */
onerror = event => {
    console.error(event.message);
}

/**
 * Sends messages to the main thread that spawned this worker thread.
 * Each message has a type property for the main thread to handle messages.
 * The data property in the message contains the data object that the worker
 * thread intends to send to the main thread.
 *
 * @param {string} messageType message type
 * @param {Object} data data to be sent
 */
function sendMessageToCaller(messageType, data) {
    postMessage({
        type: messageType,
        data: data
    });
}

function StorageStatistics(setup, compute, gather) {
    this.setup = setup;
    this.compute = compute;
    this.gather = gather;
}

StorageStatistics.prototype.computeStats = function (storageInstance) {
    const stats = this.setup();
    Object.entries(storageInstance).forEach(entry => {
        this.compute(entry, stats);
    });
    return this.gather(stats);
}

/**
 * Functions for computing statistics
 */

/**
 * Object that maps the type of data and the stats function to apply on
 * data object of that type.
 *
 * @private
 * @const {Object}
 * @default
 */
const functionMapping = {
    "NewsAndDisinfo.Measurements.PageNavigation.pageVisits": pageNavigationStats,
    "NewsAndDisinfo.Measurements.LinkExposure.linkExposures": linkExposureStats,
    "NewsAndDisinfo.Measurements.SocialMediaLinkSharing.linkShares": socialMediaLinkSharingStats,
}

/**
 * Function for computing page navigation statistics
 * @param {Object} pageNavigationStorage page navigation storage object
 */
function pageNavigationStats(pageNavigationStorage) {
    const statsObj = new StorageStatistics(
        () => {
            const stats = {};
            stats.trackedVisitsByDomain = {};
            stats.numUntrackedVisits = 0;
            return stats;
        },
        (entry, stats) => {
            const navObj = entry[1];
            if (navObj.type == "pageVisit") {
                const domain = getTrackedPathDest(navObj.url);
                const domainIndex = JSON.stringify({domain: domain});
                let domainObj = stats.trackedVisitsByDomain[domainIndex];
                if (!domainObj) {
                    stats.trackedVisitsByDomain[domainIndex] = {};
                    domainObj = stats.trackedVisitsByDomain[domainIndex];
                    domainObj.visitsByReferrer = {};
                }

                const date = new Date(navObj.pageVisitStartTime);
                const dayOfWeek = date.getUTCDay();
                const hourOfDay = date.getUTCHours();
                const timeOfDay = Math.floor(hourOfDay / 4) * 4;

                const index = JSON.stringify({
                    referrerDomain: getTrackedPathSource(navObj.referrer),
                    dayOfWeek: dayOfWeek,
                    timeOfDay: timeOfDay,
                    classifierResults: navObj.classResults
                });

                let specificObj = domainObj.visitsByReferrer[index];
                if (specificObj) {
                    specificObj.numVisits += 1;
                    specificObj.totalAttention += navObj.attentionDuration;
                    specificObj.totalScroll += Math.floor(navObj.maxRelativeScrollDepth * 100);
                    specificObj.laterSharedCount += navObj.laterShared ? 1 : 0;
                    specificObj.prevExposedCount += navObj.prevExposed ? 1 : 0;
                } else {
                    specificObj = {};
                    specificObj.numVisits = 1;
                    specificObj.totalAttention = navObj.attentionDuration;
                    specificObj.totalScroll = Math.floor(navObj.maxRelativeScrollDepth * 100);
                    specificObj.laterSharedCount = navObj.laterShared ? 1 : 0;
                    specificObj.prevExposedCount = navObj.prevExposed ? 1 : 0;
                    domainObj.visitsByReferrer[index] = specificObj;
                }
            } else if (navObj.type == "untracked") {
                stats.numUntrackedVisits += 1;
            }
        },
        (r) => {
            for (const domain in r.trackedVisitsByDomain) {
                const trackedVisits = r.trackedVisitsByDomain[domain].visitsByReferrer;
                const trackedVisitsArray = Object.entries(trackedVisits).map((pair) => {
                    const entry = JSON.parse(pair[0]);
                    entry.numVisits = pair[1].numVisits;
                    entry.totalAttention = pair[1].totalAttention;
                    entry.totalScroll = pair[1].totalScroll;
                    entry.prevExposedCount = pair[1].prevExposedCount;
                    entry.laterSharedCount = pair[1].laterSharedCount;
                    return entry;
                });
                r.trackedVisitsByDomain[domain].visitsByReferrer = trackedVisitsArray;
            }
            const domains = r.trackedVisitsByDomain;
            const domainsArray = Object.entries(domains).map((pair) => {
                const entry = JSON.parse(pair[0]);
                entry.visitsByReferrer = pair[1].visitsByReferrer;
                return entry;
            });
            r.trackedVisitsByDomain = domainsArray;
            return r;
        }
    );
    return statsObj.computeStats(pageNavigationStorage);

}

/**
 * Function for computing link exposure statistics
 * @param {Object} linkExposureStorage page navigation storage object
 */
function linkExposureStats(linkExposureStorage) {
    const statsObj = new StorageStatistics(
        () => {
            const stats = {};
            stats.untrackedLinkExposures = {"5": 0};
            stats.linkExposures = {};

            return stats;
        },
        (entry, stats) => {
            const exposureObj = entry[1];
            if (exposureObj.type == "exposure") {
                const date = new Date(exposureObj.firstSeen);
                const hourOfDay = date.getUTCHours();
                const timeOfDay = Math.floor(hourOfDay / 4) * 4;
                const index = JSON.stringify({
                    sourceDomain: getTrackedPathSource(exposureObj.pageUrl),
                    destinationDomain: getTrackedPathDest(exposureObj.url),
                    dayOfWeek: (date).getUTCDay(),
                    timeOfDay: timeOfDay,
                    visThreshold: exposureObj.visThreshold
                });
                if (!(stats.linkExposures[index])) {
                    stats.linkExposures[index] = {
                        numExposures: 1,
                        laterVisitedCount: exposureObj.laterVisited ? 1 : 0,
                        laterSharedCount: exposureObj.laterShared ? 1 : 0
                    };
                } else {
                    const current = stats.linkExposures[index];
                    stats.linkExposures[index] = {
                        numExposures: current.numExposures + 1,
                        laterVisitedCount: current.laterVisitedCount + exposureObj.laterVisited ? 1 : 0,
                        laterSharedCount: current.laterSharedCount + exposureObj.laterShared ? 1 : 0
                    }
                }
            } else if (exposureObj.type == "untracked") {
                stats.untrackedLinkExposures["5"] += exposureObj.count;
            }
        },
        (r) => {
            const exposuresArray = Object.entries(r.linkExposures).map((pair) => {
                const entry = JSON.parse(pair[0]);
                entry.numExposures = pair[1].numExposures;
                entry.laterVisitedCount = pair[1].laterVisitedCount;
                entry.laterSharedCount = pair[1].laterSharedCount;
                return entry;
            });
            r.linkExposures = exposuresArray;
            return r;
        }
    );
    return statsObj.computeStats(linkExposureStorage);
}


function socialMediaLinkSharingStats(socialMediaLinkSharingStorage) {
    const fbIndex = JSON.stringify({platform: "facebook"});
    const twIndex = JSON.stringify({platform: "twitter"});
    const rdIndex = JSON.stringify({platform: "reddit"});

    const statsObj = new StorageStatistics(
        () => {
            const stats = {};
            stats.linkSharesByPlatform = {}
            stats.linkSharesByPlatform[fbIndex] = {trackedShares: {}, numUntrackedShares: 0};
            stats.linkSharesByPlatform[twIndex] = {trackedShares: {}, numUntrackedShares: 0};
            stats.linkSharesByPlatform[rdIndex] = {trackedShares: {}, numUntrackedShares: 0};

            return stats;
        },
        (entry, stats) => {
            const val = entry[1];
            if (val.type == "untracked") {
                stats.linkSharesByPlatform[JSON.stringify({platform: val.platform})].numUntrackedShares += val.count;
            } else if (val.type == "share") {
                let platformIndex = "";
                if (val.platform == "facebook") platformIndex = fbIndex;
                if (val.platform == "twitter") platformIndex = twIndex;
                if (val.platform == "reddit") platformIndex = rdIndex;
                let platformObj = stats.linkSharesByPlatform[platformIndex];
                if (!platformObj) {
                    stats.linkSharesByPlatform[platformIndex] = {};
                    platformObj = stats.linkSharesByPlatform[platformIndex];
                }

                const hostname = getHostName(val.url);
                const visitReferrer = val.prevVisitReferrer;
                const date = new Date(val.shareTime);
                const dayOfWeek = date.getUTCDay();
                const hourOfDay = date.getUTCHours();
                const timeOfDay = Math.floor(hourOfDay / 4) * 4;

                const index = JSON.stringify({
                    domain: hostname,
                    classifierResults: val.classifierResults,
                    audience: val.audience,
                    source: val.source,
                    visitReferrer: visitReferrer,
                    prevExposed: val.prevExposed ? 1 : 0,
                    dayOfWeek: dayOfWeek,
                    timeOfDay: timeOfDay
                });
                let specificObj = platformObj.trackedShares[index];
                if (specificObj) {
                    specificObj.trackedSharesCount += 1;
                } else {
                    specificObj = {};
                    specificObj.trackedSharesCount = 1;
                    platformObj.trackedShares[index] = specificObj;
                }
            }
        },
        (r) => {
            for (const platform in r.linkSharesByPlatform) {
                const trackedShares = r.linkSharesByPlatform[platform].trackedShares;
                const trackedSharesArray = Object.entries(trackedShares).map((pair) => {
                    const entry = JSON.parse(pair[0]);
                    entry.numShares = pair[1].trackedSharesCount;
                    return entry;
                });
                r.linkSharesByPlatform[platform].trackedShares = trackedSharesArray;
            }
            const platforms = r.linkSharesByPlatform;
            const platformsArray = Object.entries(platforms).map((pair) => {
                const entry = JSON.parse(pair[0]);
                entry.numUntrackedShares = pair[1].numUntrackedShares;
                entry.trackedShares = pair[1].trackedShares;
                return entry;
            });
            r.linkSharesByPlatform = platformsArray;
            return r;
        }
    );
    return statsObj.computeStats(socialMediaLinkSharingStorage);
}

/**
 * Gets hostname from a given url string
 *
 * @param {string} url url string
 * @returns {string|null} hostname in the input url
 */
function getHostName(url) {
    const match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
    if (match != null && match.length > 2 && typeof match[2] === 'string' && match[2].length > 0) {
        return match[2];
    }
    return null;
}

/**
 * Gets domain name from a url
 *
 * @param {string} url url string
 * @returns {string|null} hostname in the input url
 */
function getDomain(url) {
    let urlObj;
    try {
        urlObj = new URL(url);
    } catch { return ""; }
    return urlObj.hostname;
}

function getTrackedPathDest(url) {
    // if this is a dest, it must have passed a destination check already
    const fbResult = fbRegex.exec(url);
    if (fbResult && fbMatcher.matches(url)) { return fbResult[0]; }
    const twResult = twRegex.exec(url);
    if (twResult && twMatcher.matches(url)) { return twResult[0]; }
    const ytResult = ytRegex.exec(url);
    if (ytResult && ytMatcher.matches(url)) { return ytResult[0]; }
    return getDomain(url);
}

function getTrackedPathSource(url) {
    // a referrer hasn't necessarily passed a check
    const fbResult = fbRegex.exec(url);
    if (fbResult && fbMatcher.matches(url)) { return fbResult[0]; }
    const twResult = twRegex.exec(url);
    if (twResult && twMatcher.matches(url)) { return twResult[0]; }
    const ytResult = ytRegex.exec(url);
    if (ytResult && ytMatcher.matches(url)) { return ytResult[0]; }
    if (referrerMatcher.matches(url)) { return getDomain(url); }
    if (destinationMatcher.matches(url)) { return getDomain(url); }
    return "other";
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
        this.wildcardSchemeSet = new Set(["http", "https", "ws", "wss", "ftp", "file", "data"]);
        this.patternsByHost = { };
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
        if(this.allUrls && this.allUrlsSchemeSet.has(scheme))
            return true;

        // Identify candidate match patterns
        let candidatePatterns = [ ];
        // Check each component suffix of the hostname for candidate match patterns
        const hostComponents = parsedUrl.hostname.split(".");
        let hostSuffix = "";
        for(let i = hostComponents.length - 1; i >= 0; i--) {
            hostSuffix = hostComponents[i] + (i < hostComponents.length - 1 ? "." : "") + hostSuffix;
            const hostSuffixPatterns = this.patternsByHost[hostSuffix];
            if(hostSuffixPatterns !== undefined)
                candidatePatterns = candidatePatterns.concat(hostSuffixPatterns);
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
                             candidatePattern.pathRegExp.test(path))
                             return true;
                      }
               }
        }

        return false;
    }

    /**
     * Exports the internals of the match pattern set for purposes of saving to extension
     * local storage.
     * @returns {object} - An opaque object representing the match pattern set internals.
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
     * @example <caption>Example usage of import.</caption>
     * // const matchPatternSet1 = new MatchPatternSet([ "*://example.com/*" ]);
     * // const exportedInternals = matchPatternSet.export();
     * // const matchPatternSet2 = (new MatchPatternSet([])).import(exportedInternals);
     */
    import(exportedInternals) {
        this.allUrls = exportedInternals.allUrls;
        this.patternsByHost = exportedInternals.patternsByHost;
    }
}

