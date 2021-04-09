/**
 * This module measures properties of webpage navigation.
 *
 * @module webScience.pageNavigation
 */

import * as events from "./events.js";
import * as messaging from "./messaging.js";
import * as pageManager from "./pageManager.js";
import * as inline from "./inline.js";
import pageNavigationContentScript from "./content-scripts/pageNavigation.content.js";

/**
 * Additional information about the page data event.
 * @typedef {Object} PageDataDetails
 * @property {number} pageId - The ID for the page, unique across browsing sessions.
 * @property {string} url - The URL of the page, without any hash.
 * @property {string} referrer - The referrer URL for the page, or `""` if there is no referrer.
 * @property {number} pageVisitStartTime - The time when the page visit started, in ms since
 * the epoch.
 * @property {number} pageVisitStopTime - The time when the page visit ended, in ms since the
 * epoch.
 * @property {number} attentionDuration - The amount of time in ms that the page had user attention.
 * @property {number} audioDuration - The amount of time in ms that the page was playing audio.
 * @property {number} attentionAndAudioDuration - The amount of time in ms that the page both had
 * user attention and was playing audio.
 * @property {number} maxRelativeScrollDepth - The maximum relative scroll depth on the page.
 * @property {boolean} privateWindow - Whether the page loaded in a private window.
 */

/**
 * @callback pageDataListener
 * @param {PageDataDetails} details - Additional information about the page data event.
 */

/**
 * @callback PageDataAddListener
 * @param {pageDataListener} listener - The listener to add.
 * @param {Object} options - Options for the listener.
 * @param {string[]} [options.matchPatterns=[]] - The webpages of interest for the measurement, specified with WebExtensions match patterns.
 * @param {boolean} [options.privateWindows=false] - Whether to measure pages in private windows.
 */

/**
 * @callback PageDataRemoveListener
 * @param {pageDataListener} listener - The listener to remove.
 */

/**
 * @callback PageDataHasListener
 * @param {pageDataListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * @callback PageDataHasAnyListeners
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * @typedef {Object} PageDataEvent
 * @property {PageDataAddListener} addListener - Add a listener for page data.
 * @property {PageDataRemoveListener} removeListener - Remove a listener for page data.
 * @property {PageDataHasListener} hasListener - Whether a specified listener has been added.
 * @property {PageDataHasAnyListeners} hasAnyListeners - Whether the event has any listeners.
 */

/**
 * Function to start measurement when a listener is added
 * TODO: deal with multiple listeners with different match patterns
 * @param {pageDataCallback} listener - new listener being added
 * @param {Object} options - Options for the listener.
 * @param {string[]} [options.matchPatterns=[]] - The webpages of interest for the measurement, specified with WebExtensions match patterns.
 * @param {boolean} [options.privateWindows=false] - Whether to measure pages in private windows.
 * @private
 */
function addListener(listener, options) {
    startMeasurement(options);
}

/**
 * Function to end measurement when the last listener is removed
 * @param {pageDataCallback} listener - listener that was just removed
 * @private
 */
function removeListener(listener) {
    if (!this.hasAnyListeners()) {
        stopMeasurement();
    }
}

/**
 * An event that fires when a page visit has ended and data about the
 * visit is available.
 * @constant {PageDataEvent}
 */
export const onPageData = events.createEvent({
    addListenerCallback: addListener,
    removeListenerCallback: removeListener
});

/**
 * The registered page navigation content script.
 * @type {browser.contentScripts.RegisteredContentScript|null}
 * @private
 */
let registeredContentScript = null;

/**
 * Whether to notify the page data listener about private windows.
 * @type {boolean}
 * @private
 */
let notifyAboutPrivateWindows = false;

/**
 * A function that is called when the content script sends a page data event message.
 * @param {PageData} pageData - Information about the page.
 * @private
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
 * @param {Object} options - A set of options for the measurement.
 * @param {string[]} [options.matchPatterns=[]] - The webpages of interest for the measurement, specified with WebExtensions match patterns.
 * @param {boolean} [options.privateWindows=false] - Whether to measure pages in private windows.
 * @private
 */
async function startMeasurement({
    matchPatterns = [ ],
    privateWindows = false
}) {
    await pageManager.initialize();

    notifyAboutPrivateWindows = privateWindows;

    registeredContentScript = await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            code: inline.dataUrlToString(pageNavigationContentScript)
        }],
        runAt: "document_start"
    });

    messaging.onMessage.addListener(pageDataListener,
    {
        type: "webScience.pageNavigation.pageData",
        schema: {
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
        }
    });
}

/**
 * Stop a navigation measurement.
 * @private
 */
function stopMeasurement() {
    messaging.onMessage.removeListener(pageDataListener);
    registeredContentScript.unregister();
    registeredContentScript = null;
    notifyAboutPrivateWindows = false;
}
