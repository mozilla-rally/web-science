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
import * as permissions from "./permissions.js";
import linkExposureContentScript from "./content-scripts/linkExposure.content.js";

permissions.check({
    module: "webScience.linkExposure",
    requiredPermissions: [ "storage" ],
    suggestedPermissions: [ "unlimitedStorage" ]
});

/**
 * @constant {debugging.debuggingLogger}
 * @private
 */
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
 */

/**
 * A callback function for the page data event.
 * @callback linkExposureListener
 * @param {LinkExposureDetails} details - Additional information about the page data event.
 */

/**
 * @typedef {Object} LinkExposureOptions
 * @property {string[]} [linkMatchPatterns=[]] - The links of interest for the measurement, specified with WebExtensions match patterns.
 * @property {string[]} [pageMatchPatterns=[]] - The pages (on which links occur) of interest for the measurement, specified with WebExtensions match patterns.
 * @property {boolean} [privateWindows=false] - Whether to measure links in private windows.
 */

/**
 * @callback LinkExposureAddListener
 * @param {linkExposureListener} listener - The listener to add.
 * @param {LinkExposureOptions} options - Options for the listener.
 */

/**
 * @callback LinkExposureRemoveListener
 * @param {linkExposureListener} listener - The listener to remove.
 */

/**
 * @callback LinkExposureHasListener
 * @param {linkExposureListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * @callback LinkExposureHasAnyListeners
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * @typedef {Object} LinkExposureEvent
 * @property {LinkExposureAddListener} addListener - Add a listener for idle state changes.
 * @property {LinkExposureRemoveListener} removeListener - Remove a listener for idle state changes.
 * @property {LinkExposureHasListener} hasListener - Whether a specified listener has been added.
 * @property {LinkExposureHasAnyListeners} hasAnyListeners - Whether the event has any listeners.
 */

/**
 * Function to start measurement when a listener is added.
 * TODO: deal with multiple listeners with different match patterns.
 * @param {linkExposureCallback} listener - The new listener being added.
 * @param {LinkExposureOptions} options - Configuration for the events to be sent to this listener.
 * @private
 */
function addListener(listener, options) {
    startMeasurement(options);
}

/**
 * TODO: refactor untracked link events into onLinkExposure
 * @private
 */
function addListenerUntracked(listener, options) {
    if (!onLinkExposure.hasAnyListeners()) {
        throw new Error("Cannot register listener for untracked links without listener for tracked");
    }
}

/**
 * Function to end measurement when the last listener is removed.
 * @param {linkExposureCallback} listener - The listener that is being removed.
 * @private
 */
function removeListener(listener) {
    if (!onLinkExposure.hasAnyListeners() && !onUntracked.hasAnyListeners()) {
        stopMeasurement();
    }
}

/**
 * @constant {LinkExposureEvent}
 */
export const onLinkExposure = events.createEvent({
    addListenerCallback: addListener,
    removeListenerCallback: removeListener});

export const onUntracked = events.createEvent({
    addListenerCallback: addListenerUntracked,
    removeListenerCallback: removeListener});

let initialized = false;

/**
 * A RegisteredContentScript object that can be used to unregister the content script.
 * @type {browser.contentScripts.RegisteredContentScript}
 * @private
 */
let registeredCS = null;

/**
 * Start a link exposure measurement. Note that only one measurement is currently supported per extension.
 * @param {LinkExposureOptions} options - A set of options for the measurement.
 * @private
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
    messaging.onMessage.addListener((exposureData) => {
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
        type: "webScience.linkExposure.exposureData",
        schema: {
            pageId: "string",
            pageUrl: "string",
            pageReferrer: "string",
            pageVisitStartTime: "number",
            privateWindow: "boolean",
            nonmatchingLinkExposures: "number",
            linkExposures: "object"
        }
    });

    initialized = true;
}

/**
 * @private
 */
function stopMeasurement() {
    if (registeredCS) {
        registeredCS.unregister();
    }
    registeredCS = null;
}

/* Utilities */

/**
 * Convert an exposure event from the content script to an exposure event for listeners.
 * @param {Object} exposureEvent link exposure event to store
 * @param {string} exposureEvent.originalUrl - link exposed to
 * @param {string} exposureEvent.resolvedUrl - optional field which is set if the isShortenedUrl and resolutionSucceeded are true
 * @param {boolean} exposureEvent.resolutionSucceded - true if link resolution succeeded
 * @param {boolean} exposureEvent.isShortenedUrl - true if link matches short domains
 * @param {number} exposureEvent.firstSeen - timestamp when the link is first seen
 * @param {number} exposureEvent.duration - milliseconds of link exposure
 * @param {Object} exposureEvent.size - width and height of links
 * @private
 */
async function createLinkExposureRecord(exposureEvent) {
    exposureEvent.type = "linkExposure";
    exposureEvent.url = (exposureEvent.isShortenedUrl && exposureEvent.resolutionSucceded ?
                         matching.normalizeUrl(exposureEvent.resolvedUrl) :
                         matching.normalizeUrl(exposureEvent.originalUrl));
    onLinkExposure.notifyListeners([ exposureEvent ]);
}
