/**
 * This module measures the user's exposure to links for specific domains.
 * @module webScience.linkExposure
 */

import * as events from "./events.js";
import * as debugging from "./debugging.js";
import * as storage from "./storage.js";
import * as linkResolution from "./linkResolution.js";
import * as matching from "./matching.js";
import * as messaging from "./messaging.js";
import * as pageManager from "./pageManager.js";
import * as inline from "./inline.js";
import linkExposureContentScript from "./content-scripts/linkExposure.content.js";

const debugLog = debugging.getDebuggingLog("linkExposure");

// TODO: significant documentation updates
/**
 * Additional information about the link exposure event.
 * @typedef {Object} LinkExposureDetails
 * @property {number} pageId - The ID for the page, unique across browsing sessions.
 * @property {number} tabId - The ID for the tab containing the page, unique to the browsing session.
 * @property {number} windowId - The ID for the window containing the page, unique to the browsing session.
 * Note that tabs can subsequently move between windows.
 * @property {string} url - The URL of the page loading in the tab, without any hash.
 * @property {string} referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @property {number} pageVisitStartTime - The time when the underlying event fired.
 * @property {boolean} privateWindow - Whether the page is in a private window.
 * @interface
 */

/**
 * A callback function for the page data event.
 * @callback linkExposureCallback
 * @param {LinkExposureDetails} details - Additional information about the page data event.
 */


/**
 * Options when adding a link exposure event listener.
 * @typedef {Object} LinkExposureOptions
 * @property {Array<string>} [linkMatchPatterns=[]] - The links of interest for the measurement, specified with WebExtensions match patterns.
 * @property {Array<string>} [pageMatchPatterns=[]] - The pages (on which links occur) of interest for the measurement, specified with WebExtensions match patterns.
 * @property {boolean} [privateWindows=false] - Whether to measure links in private windows.
 */

/**
 * Function to start measurement when a listener is added
 * TODO: deal with multiple listeners with different match patterns
 * @param {linkExposureCallback} listener - new listener being added
 * @param {LinkExposureOptions} options - configuration for the events to be sent to this listener
 */
function addListener(listener, options) {
    startMeasurement(options);
}

function addListenerUntracked(listener, options) {
    if (!onLinkExposure.hasAnyListeners()) {
        throw new Error("Cannot register listener for untracked links without listener for tracked");
    }
}

/**
 * Function to end measurement when the last listener is removed
 * @param {linkExposureCallback} listener - listener that was just removed
 */
function removeListener(listener) {
    if (!onLinkExposure.hasAnyListeners() && !onUntracked.hasAnyListeners()) {
        stopMeasurement();
    }
}

/**
 * @type {events.Event<linkExposureCallback, LinkExposureOptions>}
 */
export const onLinkExposure = events.createEvent({
    addListenerCallback: addListener,
    removeListenerCallback: removeListener});

export const onUntracked = events.createEvent({
    addListenerCallback: addListenerUntracked,
    removeListenerCallback: removeListener});

let initialized = false;

/**
 * A RegisteredContentScript object that can be used to unregister the CS
 * @type {RegisteredContentScript}
 * @private
 */
let registeredCS = null;

/**
 * Start a link exposure measurement. Note that only one measurement is currently supported per extension.
 * @param {Object} options - A set of options for the measurement.
 * @param {string[]} [options.linkMatchPatterns=[]] - The links to measure, specified with WebExtensions match patterns.
 * @param {string[]} [options.pageMatchPatterns=[]] - The pages where links should be measured, specified with WebExtensions match patterns.
 * @param {boolean} [options.privateWindows=false] - Whether to measure on pages in private windows.
 */
async function startMeasurement({
    linkMatchPatterns = [],
    pageMatchPatterns = [],
    privateWindows = false
}) {
    if(initialized)
        return;
    debugLog("Starting link exposure measurement");

    linkResolution.initialize();

    await pageManager.initialize();

    // Use a unique identifier for each webpage the user visits that has a matching domain
    const nextLinkExposureIdCounter = await storage.createCounter("webScience.linkExposure.nextLinkExposureId");

    // Generate RegExps for matching links, link shortener URLs, and AMP cache URLs
    // Store the RegExps in browser.storage.local so the content script can retrieve them
    // without recompilation
    const linkMatcher = new matching.createMatchPatternSet(linkMatchPatterns);
    const urlShortenerRegExp = linkResolution.urlShortenerRegExp;
    const ampRegExp = linkResolution.ampRegExp;
    await browser.storage.local.set({
        "webScience.linkExposure.linkMatcher": linkMatcher.export(),
        "webScience.linkExposure.urlShortenerRegExp": urlShortenerRegExp,
        "webScience.linkExposure.ampRegExp": ampRegExp
    });

    // Add the content script for checking links on pages
    registeredCS = await browser.contentScripts.register({
        matches: pageMatchPatterns,
        js: [{
            code: inline.dataUrlToString(linkExposureContentScript)
        }],
        runAt: "document_idle"
    });

    // Listen for linkExposure messages from content script
    messaging.registerListener("webScience.linkExposure.exposureData", (exposureData) => {
        // If the message is from a private window and the module isn't configured to measure
        // private windows, ignore the message
        if(exposureData.privateWindow && !privateWindows)
            return;

        if(exposureData.nonmatchingLinkExposures > 0)
            onUntracked.notifyListeners([ {
                count: exposureData.nonmatchingLinkExposures,
                timeStamp: exposureData.pageVisitStartTime
            } ]);

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
                const promise = linkResolution.resolveUrl(linkExposure.originalUrl);
                promise.then(async function (result) {
                    if (linkMatcher.matches(result.dest)) {
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

function stopMeasurement() {
    if (registeredCS) registeredCS.unregister();
    registeredCS = null;
}

/* Utilities */

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
 * @param {storage.Counter} nextLinkExposureIdCounter - counter object
 */
async function createLinkExposureRecord(exposureEvent, nextLinkExposureIdCounter) {
    exposureEvent.type = "linkExposure";
    exposureEvent.url = (exposureEvent.isShortenedUrl && exposureEvent.resolutionSucceded ?
                         matching.normalizeUrl(exposureEvent.resolvedUrl) :
                         matching.normalizeUrl(exposureEvent.originalUrl));
    onLinkExposure.notifyListeners([ exposureEvent ]);
}
