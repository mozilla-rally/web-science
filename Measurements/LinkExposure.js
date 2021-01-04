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
let storage = null;

let numUntrackedUrls = null;

let initialized = false;

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
    if(initialized)
        return;

    LinkResolution.initialize();

    await PageManager.initialize();
 
    storage = await (new Storage.KeyValueStorage("WebScience.Measurements.LinkExposure")).initialize();

    // Use a unique identifier for each webpage the user visits that has a matching domain
    var nextLinkExposureIdCounter = await (new Storage.Counter("WebScience.Measurements.LinkExposure.nextLinkExposureId")).initialize();

    numUntrackedUrls = await (new Storage.Counter("WebScience.Measurements.LinkExposure.numUntrackedUrls")).initialize();

    // Generate RegExps for matching links, link shortener URLs, and AMP cache URLs
    // Store the RegExps in browser.storage.local so the content script can retrieve them
    // without recompilation
    const linkRegExp = Matching.matchPatternsToRegExp(linkMatchPatterns);
    const urlShortenerRegExp = LinkResolution.urlShortenerRegExp;
    await browser.storage.local.set({
        "WebScience.Measurements.LinkExposure.linkRegExp": linkRegExp,
        "WebScience.Measurements.LinkExposure.urlShortenerRegExp": urlShortenerRegExp,
        "WebScience.Measurements.LinkExposure.ampRegExp": LinkResolution.ampRegExp
    });

    // Add the content script for checking links on pages
    await browser.contentScripts.register({
        matches: pageMatchPatterns,
        js: [{
                file: "/WebScience/Measurements/content-scripts/linkExposure.js"
            }],
        runAt: "document_idle"
    });

    // Listen for LinkExposure messages from content script
    Messaging.registerListener("WebScience.Measurements.LinkExposure.exposureData", (exposureData) => {
        // If the message is from a private window and the module isn't configured to measure
        // private windows, ignore the message
        if(exposureData.privateWindow && !privateWindows)
            return;

        if(exposureData.nonmatchingLinkExposures > 0)
            numUntrackedUrls.incrementBy(exposureData.nonmatchingLinkExposures);

        exposureData.linkExposures.forEach(async (linkExposure) => {
            linkExposure.pageId = exposureData.pageId;
            linkExposure.pageUrl = exposureData.pageUrl;
            linkExposure.pageReferrer = exposureData.pageReferrer;
            linkExposure.pageVisitStartTime = exposureData.pageVisitStartTime;
            linkExposure.privateWindow = exposureData.privateWindow;
            linkExposure.resolutionSucceded = true;
            // resolvedUrl is valid only for shortened URLs
            linkExposure.resolvedUrl = undefined;
            if (linkExposure.isShortenedUrl) {
                let promise = LinkResolution.resolveUrl(linkExposure.originalUrl);
                promise.then(async function (result) {
                    if (linkRegExp.test(result.dest)) {
                        linkExposure.resolvedUrl = result.dest;
                    }
                }, function (error) {
                    linkExposure.error = error.message;
                    linkExposure.resolutionSucceded = false;
                }).finally(async function () {
                    if (!linkExposure.resolutionSucceded || linkExposure.resolvedUrl !== undefined)
                        await createLinkExposureRecord(linkExposure, nextLinkExposureIdCounter);
                });
            }
            else {
                await createLinkExposureRecord(linkExposure, nextLinkExposureIdCounter);
            }
        });

    }, {
        pageId: "string",
        pageUrl: "string",
        pageReferrer: "string",
        pageVisitStartTime: "number",
        privateWindow: "boolean",
        nonmatchingLinkExposures: "number",
        linkExposures: "object"
    });

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
 * @param {Object} exposureEvent link exposure event to store
 * @param {string} exposureEvent.originalUrl - link exposed to
 * @param {string} exposureEvent.resolvedUrl - optional field which is set if the isShortenedUrl and resolutionSucceeded are true
 * @param {boolean} exposureEvent.resolutionSucceded - true if link resolution succeeded
 * @param {boolean} exposureEvent.isShortenedUrl - true if link matches short domains
 * @param {number} exposureEvent.firstSeen - timestamp when the link is first seen
 * @param {number} exposureEvent.duration - milliseconds of link exposure
 * @param {Object} exposureEvent.size - width and height of links
 * @param {Storage.Counter} nextLinkExposureIdCounter - counter object
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

/*
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
*/

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
