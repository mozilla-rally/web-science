/**
 * This module measures properties of webpage navigation.
 *
 * @module WebScience.Measurements.PageNavigation
 */

import * as Events from "../Utilities/Events.js"
//import * as Matching from "../Utilities/Matching.js"
import * as Messaging from "../Utilities/Messaging.js"
import * as PageManager from "../Utilities/PageManager.js"

/**
 * Additional information about the page data event.
 * @typedef {Object} PageDataDetails
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
 * @callback pageDataCallback
 * @param {PageDataDetails} details - Additional information about the page data event.
 */

/**
 * Options when adding a page data event listener.
 * @typedef {Object} PageDataOptions
 * @property {Array<string>} [matchPattern=[]] - The webpages of interest for the measurement, specified with WebExtensions match patterns.
 * @property {boolean} [privateWindows=false] - Whether to measure pages in private windows.
 */

/**
 * Function to start measurement when a listener is added
 * TODO: deal with multiple listeners with different match patterns
 * @param {EventCallbackFunction} listener - new listener being added
 * @param {PageDataOptions} options - configuration for the events to be sent to this listener
 */
function addListener(listener, options) {
    startMeasurement(options);
}

/**
 * Function to end measurement when the last listener is removed
 * @param {EventCallbackFunction} listener - listener that was just removed
 */
function removeListener(listener) {
    if (!this.hasAnyListeners()) {
        stopMeasurement();
    }
}

/**
 * @type {Events.Event<pageDataCallback, PageDataOptions>}
 */
export const onPageData = new Events.Event({
    addListenerCallback: addListener,
    removeListenerCallback: removeListener});

/**
 * A RegExp for the page match patterns.
 * @type {RegExp|null}
 */
//let matchPatternsRegExp = null;

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
 * A function that is called when the content script sends a page data event message.
 * @param {PageData} pageData - Information about the page.
 */
function pageDataListener(pageData) {
    // If the page is in a private window and the module should not measure private windows,
    // ignore the page
    if(!notifyAboutPrivateWindows && pageData.privateWindow)
        return;

    // Delete the type string from the content script message
    // There isn't (yet) a good way to document this in JSDoc, because there isn't support
    // for object inheritance
    delete pageData.type;

    onPageData.notifyListeners([ pageData ]);
}

/**
 * Start a navigation measurement. Note that only one measurement is currently supported per extension.
 * @param {PageDataOptions} options - A set of options for the measurement.
 */
export async function startMeasurement({
    matchPatterns = [ ],
    privateWindows = false
}) {
    await PageManager.initialize();

    //matchPatternsRegExp = Matching.matchPatternsToRegExp(matchPatterns);

    notifyAboutPrivateWindows = privateWindows;

    registeredContentScript = await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            file: "/WebScience/Measurements/content-scripts/pageNavigation.js"
        }],
        runAt: "document_start"
    });

    Messaging.registerListener("WebScience.Measurements.PageNavigation.PageData", pageDataListener,
    {
        pageId: "string",
        url: "string",
        referrer: "string",
        pageVisitStartTime: "number",
        pageVisitStopTime: "number",
        attentionDuration: "number",
        audioDuration: "number",
        attentionAndAudioDuration: "number",
        maxRelativeScrollDepth: "number",
        privateWindow: "boolean"
    });
}

/**
 * Stop a navigation measurement.
 */
function stopMeasurement() {
    Messaging.unregisterListener("WebScience.Measurements.PageNavigation.PageData", pageDataListener)
    registeredContentScript.unregister();
    registeredContentScript = null;
    notifyAboutPrivateWindows = false;
    //matchPatternsRegExp = null;
}

