/**
 * This module measures properties of video consumption.
 * 
 * @module WebScience.videoConsumption
 */

import * as debugging from "./debugging.js"
import * as events from "./events.js"
import * as matching from "./matching.js"
import * as messaging from "./messaging.js"
import * as pageManager from "./pageManager.js"
import videoConsumptionContentScript from "./content-scripts/videoConsumption.content.js";

/**
 * @constant {debugging.debuggingLogger}
 * @private
 */
const debugLog = debugging.getDebuggingLog("videoConsumption");

/**
 * Additional information about the video consumption event.
 * @typedef {Object} VidoDataDetails
 * @property {number} pageId - The ID for the page, unique across browsing sessions.
 * @property {number} tabId - The ID for the tab containing the page, unique to the browsing session.
 * @property {number} windowId - The ID for the window containing the page, unique to the browsing session.
 * Note that tabs can subsequently move between windows.
 * @property {string} url - The URL of the page loading in the tab, without any hash.
 * @property {string} referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @property {number} pageVisitStartTime - The time when the page visit began.
 * @property {number} pageVisitStopTime - The time when the underlying event fired.
 * @property {number} playbackDuration - The total number of milliseconds videos on the page were playing.
 * @property {string} ytChannel - The URL of the YouTube channel that uploaded the video (empty string if the page is not on YouTube).
 * @property {boolean} privateWindow - Whether the page is in a private window.
 * @interface
 */

/**
 * A callback function for the page data event.
 * @callback videoDataCallback
 * @param {VideoDataDetails} details - Additional information about the page data event.
 */

/**
 * Options when adding a page data event listener.
 * @typedef {Object} VideoDataOptions
 * @property {Array<string>} [matchPattern=[]] - The webpages of interest for the measurement, specified with WebExtensions match patterns.
 */

/**
 * An extension of Events.EventSingleton for the video data event.
 * @extends {Events.EventSingleton} 
 */
class VideoDataEvent extends Events.EventSingleton {
    addListener(listener, options) {
        super.addListener(listener, options);
        startMeasurement(options);
    };

    removeListener(listener) {
        stopMeasurement();
        super.removeListener(listener);
    }
}

/**
 * @type {Events.EventSingleton<videoDataCallback, VideoDataOptions>}
 */
export const onVideoData = new VideoDataEvent();

/**
 * A RegExp for the page match patterns.
 * @type {RegExp|null}
 */
let matchPatternsRegExp = null;

/**
 * The registered page navigation content script.
 * @type {RegisteredContentScript|null} 
 */
let registeredContentScript = null;

/**
 * Whether to notify the page data listener about private windows.
 */
let notifyAboutPrivateWindows = false;

/**
 * A function that is called when the content script sends a video data event message.
 * @param {VideoDataDetails} videoData - Information about the video consumption.
 */
function videoDataListener(videoData) {
    // If the page is in a private window and the module should not measure private windows,
    // ignore the page
    if(!notifyAboutPrivateWindows && videoData.privateWindow)
        return;

    // Delete the type string from the content script message
    // There isn't (yet) a good way to document this in JSDoc, because there isn't support
    // for object inheritance
    delete videoData.type;

    onVideoData.notifyListeners([ videoData ]);
}

/**
 * Start a video consumption measurement. Note that only one measurement is currently supported per extension.
 * @param {VideoDataOptions} options - A set of options for the measurement.
 */
export async function startMeasurement({
    matchPatterns // causes error when empty, so we need to change default value
}) {
    let privateWindows = false

    await pageManager.initialize();

    matchPatternsRegExp = matching.matchPatternsToRegExp(matchPatterns);

    notifyAboutPrivateWindows = privateWindows;

    registeredContentScript = await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            file: inline.dataUrlToString(linkExposureContentScript)
        }],
        runAt: "document_idle"
    });


    // Listen for linkExposure messages from content script
    messaging.onMessage.addListener(videoDataListener, {
        type: "webScience.videoConsumption.videoData",
        schema: {
	        pageId: "string",
	        url: "string",
	        referrer: "string",
	        pageVisitStartTime: "number",
	        pageVisitStopTime: "number",
	        playbackDuration: "number",
	        ytChannel: "string", // TODO: what to put here if this might be empty? 
	        privateWindow: "boolean"
	    }
    });
}

/**
 * Stop a navigation measurement.
 */
function stopMeasurement() {
    messaging.unregisterListener("WebScience.Measurements.VideoConsumption.VideoData", videoDataListener)
    registeredContentScript.unregister();
    registeredContentScript = null;
    notifyAboutPrivateWindows = false;
    matchPatternsRegExp = null;
}