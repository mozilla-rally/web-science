/**
 * This module measures the user's exposure to links for specific domains.
 * @module WebScience.Measurements.LinkExposure
 */

import * as Debugging from "../Utilities/Debugging.js"
import * as Storage from "../Utilities/Storage.js"
import * as LinkResolution from "../Utilities/LinkResolution.js"
import * as Matching from "../Utilities/Matching.js"
import * as Messaging from "../Utilities/Messaging.js"
import * as PageManager from "../Utilities/PageManager.js"

const debugLog = Debugging.getDebuggingLog("Measurements.LinkExposure");

/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;

var numUntrackedUrlsByThreshold = {};

var initialized = false;

var visibilityThresholds = [1000, 3000, 5000, 10000]; // match to CS values
/**
 * Start a link exposure measurement. Note that only one measurement is currently supported per extension.
 * @param {Object} options - A set of options for the measurement.
 * @param {string[]} [options.linkMatchPatterns=[]] - The links to measure, specified with WebExtensions match patterns.
 * @param {string[]} [options.pageMatchPatterns=[]] - The pages where links should be measured, specified with WebExtensions match patterns.
 * @param {boolean} [options.privateWindows=false] - Whether to measure on pages in private windows.
 */
export async function startMeasurement({
    linkMatchPatterns = [],
    pageMatchPatterns = [],
    privateWindows = false
}) {

    LinkResolution.initialize();

    // store private windows preference in the storage
    await browser.storage.local.set({ "WebScience.Measurements.LinkExposure.privateWindows": privateWindows }); 
    storage = await (new Storage.KeyValueStorage("WebScience.Measurements.LinkExposure")).initialize();
    // Use a unique identifier for each webpage the user visits that has a matching domain
    var nextLinkExposureIdCounter = await (new Storage.Counter("WebScience.Measurements.LinkExposure.nextPageId")).initialize();
    let shortDomains = LinkResolution.getShortDomains();
    let ampCacheDomains = LinkResolution.getAmpCacheDomains();
    let shortDomainPattern = Matching.createUrlRegexString(shortDomains);
    let ampCacheDomainPattern = Matching.createUrlRegexString(ampCacheDomains);
    for (var visThreshold of visibilityThresholds) {
        numUntrackedUrlsByThreshold[visThreshold] = await (new Storage.Counter("WebScience.Measurements.LinkExposure.numUntrackedUrls" + visThreshold)).initialize();
    }
    const ampCacheMatcher = new RegExp(ampCacheDomainPattern);
    const shortDomainMatcher = new RegExp(shortDomainPattern);
    const urlMatcher = Matching.matchPatternsToRegExp(linkMatchPatterns);
    await browser.storage.local.set({linkRegex: urlMatcher, shortDomainRegex: shortDomainMatcher, ampDomainRegex : ampCacheMatcher});

    // Add the content script for checking links on pages
    await browser.contentScripts.register({
        matches: pageMatchPatterns,
        js: [{
            file: "/WebScience/Measurements/content-scripts/utils.js"
        },
            {
                file: "/WebScience/Measurements/content-scripts/linkExposure.js"
            }
        ],
        runAt: "document_idle"
    });

    // Listen for LinkExposure messages from content script
    Messaging.registerListener("WebScience.LinkExposure.linkData", (exposureInfo, sender) => {
        if (!("tab" in sender)) {
            debugLog("Warning: unexpected link exposure update");
            return;
        }
        var untrackedInfo = exposureInfo.numUntrackedUrls;
        for (var visThreshold in untrackedInfo) {
            numUntrackedUrlsByThreshold[visThreshold].incrementByAndGet(untrackedInfo[visThreshold]);
        }
        exposureInfo.exposureEvents.forEach(async exposureEvent => {
            exposureEvent.isShortenedUrl = shortDomainMatcher.test(exposureEvent.originalUrl);
            exposureEvent.resolutionSucceded = true;
            exposureEvent.metadata = exposureInfo.metadata;
            // resolvedUrl is valid only for urls from short domains
            exposureEvent.resolvedUrl = undefined;
            if (exposureEvent.isShortenedUrl) {
                let promise = LinkResolution.resolveUrl(exposureEvent.originalUrl);
                promise.then(async function (result) {
                    if (urlMatcher.test(result.dest)) {
                        exposureEvent.resolvedUrl = result.dest;
                    }
                }, function (error) {
                    exposureEvent.error = error.message;
                    exposureEvent.resolutionSucceded = false;
                }).finally(async function () {
                    if (!exposureEvent.resolutionSucceded || exposureEvent.resolvedUrl !== undefined)
                        await createLinkExposureRecord(exposureEvent, nextLinkExposureIdCounter);
                });
            } else {
                await createLinkExposureRecord(exposureEvent, nextLinkExposureIdCounter);
            }
        });

    }, {
        type: "string",
        metadata: "object"
    });

    await PageManager.initialize();

    initialized = true;
}


/* Utilities */

/**
 * Retrieve the study data as an object. Note that this could be very
 * slow if there is a large volume of study data.
 * @returns {(Object|null)} - The study data, or `null` if no data
 * could be retrieved.
 */
export async function getStudyDataAsObject() {
    if(storage != null)
        return await storage.getContentsAsObject();
    return null;
}

/**
 * 
 * @param {LinkExposureEvent} exposureEvent link exposure event to store
 * @param {string} LinkExposureEvent.originalUrl - link exposed to
 * @param {string} LinkExposureEvent.resolvedUrl - optional field which is set if the isShortenedUrl and resolutionSucceeded are true
 * @param {boolean} LinkExposureEvent.resolutionSucceded - true if link resolution succeeded
 * @param {boolean} LinkExposureEvent.isShortenedUrl - true if link matches short domains
 * @param {number} LinkExposureEvent.firstSeen - timestamp when the link is first seen
 * @param {number} LinkExposureEvent.duration - milliseconds of link exposure
 * @param {Object} LinkExposureEvent.size - width and height of links
 * @param {Counter} nextLinkExposureIdCounter counter object
 */
async function createLinkExposureRecord(exposureEvent, nextLinkExposureIdCounter) {
    exposureEvent.type = "linkExposure";
    exposureEvent.url = (exposureEvent.isShortenedUrl && exposureEvent.resolutionSucceded ?
                         Storage.normalizeUrl(exposureEvent.resolvedUrl) :
                         Storage.normalizeUrl(exposureEvent.originalUrl));
    exposureEvent.laterVisited = false;
    exposureEvent.laterShared = false;
    //debugLog("storing " + JSON.stringify(exposureEvent));
    var key = exposureEvent.url + " " + await nextLinkExposureIdCounter.getAndIncrement();
    storage.set(key, exposureEvent);
}

export async function storeAndResetUntrackedExposuresCount() {
    if (initialized) {
        var untrackedObj = { type: "numUntrackedUrls", untrackedCounts: {}};
        for (var visThreshold of visibilityThresholds) {
            untrackedObj.untrackedCounts[visThreshold] = {
                threshold: visThreshold,
                numUntracked: await numUntrackedUrlsByThreshold[visThreshold].getAndReset()
            };
        }
        await storage.set("WebScience.Measurements.LinkExposure.untrackedUrlsCount", untrackedObj);
    }
}

export async function logVisit(url) {
    var prevExposures = await storage.startsWith(url);
    var hasPrevExposures = false;
    for (var key in prevExposures) {
        hasPrevExposures = true;
        prevExposures[key].laterVisited = true;
        await storage.set(key, prevExposures[key]);
    }
    return (hasPrevExposures);
}

export async function logShare(url) {
    var prevExposures = await storage.startsWith(url);
    var hasPrevExposures = false;
    for (var key in prevExposures) {
        hasPrevExposures = true;
        prevExposures[key].laterShared = true;
        await storage.set(key, prevExposures[key]);
    }
    return hasPrevExposures;
}
