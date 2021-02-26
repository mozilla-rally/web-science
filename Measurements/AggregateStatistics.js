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
    console.log(data);
    const studyDomains = data.studyDomains;
    destinationMatcher = studyDomains.destinationMatcher;
    referrerMatcher = studyDomains.referrerMatcher;
    console.log(referrerMatcher);
    fbMatcher = studyDomains.fbMatcher;
    ytMatcher = studyDomains.ytMatcher;
    twMatcher = studyDomains.twMatcher;
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
 * The number of seconds in a day.
 * @private
 * @const {number}
 * @default
 */
//const _MS_PER_DAY = 1000 * 60 * 60 * 24;
/**
 * Maximum date supported. Used in computing the earliest
 * date from a list of date objects.
 * @private
 * @const {number}
 * @default
 */
//const _MAX_DATE = 8640000000000000;

/**
 * Object that maps the type of data and the stats function to apply on
 * data object of that type.
 *
 * @private
 * @const {Object}
 * @default
 */
const functionMapping = {
    "NewsAndDisinfo.Measurements.PageNavigation": pageNavigationStats,
    "NewsAndDisinfo.Measurements.LinkExposure": linkExposureStats,
    "NewsAndDisinfo.Measurements.SocialMediaLinkSharing": socialMediaLinkSharingStats
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

                const date = new Date(navObj.visitStart);
                const dayOfWeek = date.getUTCDay();
                const hourOfDay = date.getUTCHours();
                const timeOfDay = Math.floor(hourOfDay / 4) * 4;

                const index = JSON.stringify({
                    referrerDomain: getTrackedPathSource(navObj.referrer),
                    dayOfWeek: dayOfWeek,
                    timeOfDay: timeOfDay,
                    classifierResults: navObj.classification
                });

                let specificObj = domainObj.visitsByReferrer[index];
                if (specificObj) {
                    specificObj.numVisits += 1;
                    specificObj.totalAttention += navObj.attentionDuration;
                    specificObj.totalScroll += navObj.scrollDepth == -1 ? 0 :
                        Math.floor(navObj.scrollDepth * 100);
                    specificObj.laterSharedCount += navObj.laterShared ? 1 : 0;
                    specificObj.prevExposedCount += navObj.prevExposed ? 1 : 0;
                } else {
                    specificObj = {};
                    specificObj.numVisits = 1;
                    specificObj.totalAttention = navObj.attentionDuration;
                    specificObj.totalScroll = navObj.scrollDepth == -1 ? 0 :
                        Math.floor(navObj.scrollDepth * 100);
                    specificObj.laterSharedCount = navObj.laterShared ? 1 : 0;
                    specificObj.prevExposedCount = navObj.prevExposed ? 1 : 0;
                    domainObj.visitsByReferrer[index] = specificObj;
                }
            } /*else if (navObj.type == "untrackedVisitCount") {
                stats.numUntrackedVisits = navObj.numUntrackedVisits;
            }*/
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
            //stats.untrackedLinkExposures = {};
            stats.linkExposures = {};

            return stats;
        },
        (entry, stats) => {
            const exposureObj = entry[1];
            if (exposureObj.type == "linkExposure") {
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
            } /*else if (exposureObj.type == "numUntrackedUrls") {
                for (const threshold in exposureObj.untrackedCounts) {
                    const thresholdObj = exposureObj.untrackedCounts[threshold];
                    stats.untrackedLinkExposures[thresholdObj.threshold] =
                        thresholdObj.numUntracked;
                }
            }*/
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
            /*
            if (val.type == "numUntrackedSharesTwitter") {
                stats.linkSharesByPlatform[twIndex].numUntrackedShares += val.twitter;
            } else if (val.type == "numUntrackedSharesFacebook") {
                stats.linkSharesByPlatform[fbIndex].numUntrackedShares += val.facebook;
            } else if (val.type == "numUntrackedSharesReddit") {
                stats.linkSharesByPlatform[rdIndex].numUntrackedShares += val.reddit;
            } else */if (val.type == "linkShare") {
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
                const prevVisitReferrers = val.prevVisitReferrers;
                let visitReferrer = null;
                if (prevVisitReferrers && prevVisitReferrers.length > 0) {
                    visitReferrer = getTrackedPathSource(prevVisitReferrers[0]);
                }
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
    if (fbResult && fbMatcher.test(url)) { return fbResult[0]; }
    /*
    let twResult = twRegex.exec(url);
    if (twResult && twPages.test(url)) { return twResult[0]; }
    */
    const ytResult = ytRegex.exec(url);
    if (ytResult && ytMatcher.test(url)) { return ytResult[0]; }
    return getDomain(url);
}

function getTrackedPathSource(url) {
    const fbResult = fbRegex.exec(url);
    if (fbResult && fbMatcher.test(url)) { return fbResult[0]; }
    const twResult = twRegex.exec(url);
    if (twResult && twMatcher.test(url)) { return twResult[0]; }
    const ytResult = ytRegex.exec(url);
    if (ytResult && ytMatcher.test(url)) { return ytResult[0]; }
    if (referrerMatcher.test(url)) { return getDomain(url); }
    if (destinationMatcher.test(url)) { return getDomain(url); }
    return "other";
}
