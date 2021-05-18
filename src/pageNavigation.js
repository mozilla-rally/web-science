/**
 * This module enables measuring user engagement with webpages. See the `onPageData`
 * event for specifics.
 *
 * @module pageNavigation
 */

import * as events from "./events.js";
import * as messaging from "./messaging.js";
import * as pageManager from "./pageManager.js";
import * as inline from "./inline.js";
import * as matching from "./matching.js";
import pageNavigationContentScript from "./content-scripts/pageNavigation.content.js";

/**
 * A listener for the `onPageData` event.
 * @callback pageDataListener
 * @memberof module:pageNavigation.onPageData
 * @param {Object} details - Additional information about the page data event.
 * @param {string} details.pageId - The ID for the page, unique across browsing sessions.
 * @param {string} details.url - The URL of the page, without any hash.
 * @param {string} details.referrer - The referrer URL for the page, or `""` if there is no referrer.
 * @param {number} details.pageVisitStartTime - The time when the page visit started, in ms since
 * the epoch.
 * @param {number} details.pageVisitStopTime - The time when the page visit ended, in ms since the
 * epoch.
 * @param {number} details.attentionDuration - The amount of time in ms that the page had user attention.
 * @param {number} details.audioDuration - The amount of time in ms that the page was playing audio.
 * @param {number} details.attentionAndAudioDuration - The amount of time in ms that the page both had
 * user attention and was playing audio.
 * @param {number} details.maxRelativeScrollDepth - The maximum relative scroll depth on the page.
 * @param {boolean} details.privateWindow - Whether the page loaded in a private window.
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
 * A map where each key is a listener and each value is a record for that listener.
 * @constant {Map<pageDataListener, PageDataListenerRecord>}
 * @private
 */
const pageDataListeners = new Map();

/**
 * Add a listener for the `onPageData` event.
 * @function addListener
 * @memberof module:pageNavigation.onPageData
 * @param {pageDataListener} listener - The listener to add.
 * @param {Object} options - Options for the listener.
 * @param {string[]} options.matchPatterns - The webpages that the listener should be notified about, specified with WebExtensions match patterns.
 * @param {boolean} [options.privateWindows=false] - Whether to measure pages in private windows.
 */

/**
 * Remove a listener for the `onPageData` event.
 * @function removeListener
 * @memberof module:pageNavigation.onPageData
 * @param {pageDataListener} listener - The listener to remove.
 */

/**
 * Whether a specified listener has been added for the `onPageData` event.
 * @function hasListener
 * @memberof module:pageNavigation.onPageData
 * @param {pageDataListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * Whether the `onPageData` event has any listeners.
 * @function hasAnyListeners
 * @memberof module:pageNavigation.onPageData
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * An event that fires when a page visit has ended and data about the
 * visit is available.
 * @namespace
 */
export const onPageData = events.createEvent({
    name: "webScience.pageNavigation.onPageData",
    addListenerCallback: addListener,
    removeListenerCallback: removeListener,
    notifyListenersCallback: () => { return false; }
});

/**
 * Whether the module has completed initialization.
 * @type {boolean}
 * @private
 */
let initialized = false;

/**
 * A callback function for adding a page data listener.
 * @param {pageDataCallback} listener - The listener being added.
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
        messaging.onMessage.addListener(pageData => {
            // Remove the type string from the content script message
            delete pageData.type;

            // Notify listeners when the private window and match pattern requirements are met
            for(const [listener, listenerRecord] of pageDataListeners) {
                if((!pageData.privateWindow || listenerRecord.privateWindows)
                && (listenerRecord.matchPatternSet.matches(pageData.url))) {
                    listener(pageData);
                }
            }
        },
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
