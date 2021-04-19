/**
 * This module enables measuring user engagement with webpages. See the `onPageData`
 * event for specifics.
 *
 * @module webScience.pageNavigation
 */

import * as events from "./events.js";
import * as messaging from "./messaging.js";
import * as pageManager from "./pageManager.js";
import * as inline from "./inline.js";
import * as matching from "./matching.js";
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
 * @typedef {Object} PageDataListenerRecord
 * @property {matching.MatchPatternSet} matchPatternSet - The match patterns for the listener.
 * @property {boolean} privateWindows - Whether to notify the listener about pages in private windows.
 * @property {browser.contentScripts.RegisteredContentScript} contentScript - The content
 * script associated with the listener.
 * @private
 */

/**
 * A map where each key is a listener function and each value is a record for that listener function.
 * @constant {Map<pageDataListener, PageDataListenerRecord>}
 * @private
 */
const pageDataListeners = new Map();

/**
 * @callback PageDataAddListener
 * @param {pageDataListener} listener - The listener to add.
 * @param {Object} options - Options for the listener.
 * @param {string[]} options.matchPatterns - The webpages that the listener should be notified about, specified with WebExtensions match patterns.
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
 * An event that fires when a page visit has ended and data about the
 * visit is available.
 * @constant {PageDataEvent}
 */
export const onPageData = events.createEvent({
    name: "webScience.pageNavigation.onPageData",
    addListenerCallback: addListener,
    removeListenerCallback: removeListener,
    notifyListenersCallback: () => { return false; }
});

/**
 * Whether the module has completed initialization.
 * @type{boolean}
 * @private
 */
let initialized = false;

/**
 * A callback function for adding a page data listener.
 * @param {pageDataCallback} listener - The listener function being added.
 * @param {Object} options - Options for the listener.
 * @param {string[]} options.matchPatterns - The match patterns for pages where the listener should
 * be notified.
 * @param {boolean} [options.privateWindows=false] - Whether the listener should be notified for
 * pages in private windows.
 * @private
 */
async function addListener(listener, {
    matchPatterns,
    privateWindows = false
}) {
    // Initialization
    if(!initialized) {
        initialized = true;
        await pageManager.initialize();
        messaging.onMessage.addListener(messageListener,
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

    // Compile the match patterns for the listener
    const matchPatternSet = matching.createMatchPatternSet(matchPatterns);
    // Register a content script for the listener
    const contentScript = await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            code: inline.dataUrlToString(pageNavigationContentScript)
        }],
        runAt: "document_start"
    });

    // Store a record for the listener
    pageDataListeners.set(listener, {
        matchPatternSet,
        contentScript,
        privateWindows
    });
}

/**
 * A callback function for removing a page data listener.
 * @param {pageDataCallback} listener - The listener that is being removed.
 * @private
 */
 function removeListener(listener) {
    // If there is a record of the listener, unregister its content script
    // and delete the record
    const listenerRecord = pageDataListeners.get(listener);
    if(listenerRecord === undefined) {
        return;
    }
    listenerRecord.contentScript.unregister();
    pageDataListeners.delete(listener);
}

/**
 * A callback function for messages from the content script.
 * @param {PageDataDetails} pageData - Information about the page.
 * @private
 */
 function messageListener(pageData) {
    // Remove the type string from the content script message
    delete pageData.type;

    // Notify listeners when the private window and match pattern requirements are met
    for(const [listener, listenerRecord] of pageDataListeners) {
        if((!pageData.privateWindow || listenerRecord.privateWindows)
        && (listenerRecord.matchPatternSet.matches(pageData.url))) {
            listener(pageData);
        }
    }
}
