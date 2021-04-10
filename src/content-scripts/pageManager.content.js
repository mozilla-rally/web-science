/**
 * Content script for the pageManager module. This script provides a
 * `webScience.pageManager` API with global scope in the content script environment.
 * The API includes the following features.
 *   * Page Tracking
 *     * `pageId` - A unique ID for the page.
 *     * `url` - The URL of the page, omitting any hash.
 *     * `referrer` - The referrer for the page.
 *   * Page Events
 *     * `onPageVisitStart` - An event that fires when a page visit begins. Note that
 *       the page visit start event may have already fired by the time another
 *       content script attaches (see discussion below).
 *     * `onPageVisitStop` - An event that fires when a page visit ends.
 *     * `onPageAttentionUpdate` - An event that fires when the page's attention state
 *     changes.
 *     * `onPageAudioUpdate` - An event that fires when the page's audio state changes.
 *   * Page Properties
 *     * `pageHasAttention` - Whether the page currently has the user's attention.
 *     * `pageHasAudio - Whether there is currently audio playing on the page.
 *     * `pageVisitStarted` - Whether the page visit start event has completed firing,
 *     such that all listeners have been notified.
 *     * `pageVisitStartTime` - The time that the page visit started.
 *
 * # Events
 * See the documentation in the pageManager module for detail on the event types.
 *
 * Each event implements the standard WebExtensions event features.
 *   * addListener
 *   * removeListener
 *   * hasListener
 *
 * Event listeners receive an object with the following property.
 *   * timeStamp - The time that the underlying browser event fired.
 *
 * Listeners for the page visit start event receive an object with the following
 * additional property.
 *   * isHistoryChange - Whether the page visit was caused by a change via the History API.
 *
 * Example usage:
 * ```
 * webScience.pageManager.onPageVisitStop.addListener(({timeStamp}) => {
 *     console.log(`Page visit stopped at ${timeStamp} with page ID ${pageManager.pageId}`);
 * });
 *
 * webScience.pageManager.onPageAttentionUpdate.addListener(({timeStamp}) => {
 *     console.log(`Page attention update at ${timeStamp} with attention state ${pageManager.pageHasAttention}.`);
 * });
 * ```
 *
 * # Content Script Load Ordering
 * ## Executing a Content Script After the pageManager API Has Loaded
 * Note that the WebExtensions content script model does not guarantee execution
 * order for content scripts, so it is possible that the API will not have loaded
 * when a content script that depends on the API loads. As a workaround, this
 * content script checks the global `pageManagerHasLoaded` for an array of
 * functions to call after the content script has executed, but before the content
 * script has fired the page visit start event.
 *
 * Example usage:
 * ```
 * function main() {
 *     // Content script logic goes here
 * }
 *
 * if(("webScience" in window) && ("pageManager" in window.webScience))
 *     main();
 * else {
 *     if(!("pageManagerHasLoaded" in window))
 *         window.pageManagerHasLoaded = [];
 *     window.pageManagerHasLoaded.push(main);
 * }
 * ```
 *
 * ## Listening for the Page Visit Start Event
 * Because the order of content script execution is not guaranteed, a content
 * script that uses the pageManager API might miss a page visit start event. For
 * example, the pageManager content script might attach and fire the page visit
 * start event, then another content script attaches and begins listening for
 * the event. The pageManager API addresses this limitation by providing a
 * `pageVisitStarted` boolean reflecting whether the page visit start event has
 * already completed firing (i.e., all listeners have been notified). Content scripts
 * that use the page visit start event will commonly want to call their own page visit
 * start listener if `pageVisitStarted` is `true`.
 *
 * Example usage:
 * ```
 * function pageVisitStartListener({timeStamp}) {
 *     // Page visit start logic goes here
 * }
 * webScience.pageManager.onPageVisitStart.addListener(pageVisitStartListener);
 * if(webScience.pageManager.pageVisitStarted)
 *     pageVisitStartListener({ timeStamp: pageManager.pageVisitStartTime });
 * ```
 *
 * # Known Issues
 *   * When sending a page visit stop message to the background script, sometimes
 *     Firefox generates an error ("Promise resolved while context is inactive")
 *     because the content script execution environment is terminating while the
 *     message sending Promise remains open. This error does not affect functionality,
 *     because we do not depend on resolving the Promise (i.e., a response to the
 *     page visit stop message).
 * @module webScience.pageManager.content
 */

import { generateId } from "../id.js";
import { createEvent } from "../events.js";

// IIFE wrapper to allow early return
(function () {

    // Check if the pageManager content script has already run on this page
    // If it has, bail out
    if(("webScience" in window) && ("pageManager" in window.webScience)) {
        return;
    }

    // Construct a webScience.pageManager object on the `window` global
    // All the public pageManager functionality that is available in the content
    // script environment is exposed through this object
    if(!("webScience" in window)) {
        window.webScience = { };
    }
    window.webScience.pageManager = { };
    const pageManager = window.webScience.pageManager;

    /**
     * Returns a copy of the URL string from `window.location.href`, without any
     * hash at the end. We canonicalize URLs without the hash because jumping
     * between parts of a page (as indicated by a hash) should not be considered page
     * navigation.
     * @returns {string}
     */
    function locationHrefWithoutHash() {
        const urlObj = new URL(window.location.href);
        urlObj.hash = "";
        return urlObj.href;
    }

    /**
     * Log a debugging message to `console.debug` in a standardized format.
     * @param {string} message - The debugging message.
     */
    function debugLog(message) {
        console.debug(`webScience.pageManager.content: ${message}`);
    }

    /**
     * Additional information about an event, containing only a time stamp.
     * @typedef {Object} TimeStampDetails
     * @property {number} timeStamp - The time when the underlying event occurred.
     */

    /**
     * A callback function with a time stamp parameter.
     * @callback callbackWithTimeStamp
     * @param {TimeStampDetails} details - Additional information about the event.
     */

    /**
     * Additional information about a page visit start event.
     * @typedef {Object} PageVisitStartDetails
     * @property {number} timeStamp - The time when the underlying event occurred.
     * @property {boolean} isHistoryChange - Whether the page visit was caused by a change via the History API.
     */

    /**
     * A callback function for the page visit start event.
     * @callback pageVisitStartCallback
     * @param {PageVisitStartDetails} details - Additional information about the event.
     */

    /**
     * @callback PageManagerAddListener
     * @template {ListenerFunction}
     * @param {ListenerFunction} listener
     */

    /**
     * @callback PageManagerRemoveListener
     * @template {ListenerFunction}
     * @param {ListenerFunction} listener
     */

    /**
     * @callback PageManagerHasListener
     * @template {ListenerFunction}
     * @param {ListenerFunction} listener
     */

    /**
     * @callback PageManagerHasAnyListeners
     * @returns {boolean}
     */

    /**
     * @typedef {Object} PageManagerEvent
     * @template {ListenerFunction}
     * @property {PageManagerAddListener<ListenerFunction>} addListener - Add a listener function for the event.
     * @property {PageManagerRemoveListener<ListenerFunction>} removeListener - Remove a listener function for the event.
     * @property {PageManagerHasListener<ListenerFunction>} hasListener - Whether a listener function has been added for the event.
     * @property {PageManagerHasAnyListeners} hasAnyListeners - Whether any listener functions have been added for the event.
     */

    /**
     * An event that is fired when a page visit starts.
     * @type {PageManagerEvent<pageVisitStartCallback>}
     */
    pageManager.onPageVisitStart = createEvent();

    /**
     * An event that is fired when a page visit stops.
     * @type {PageManagerEvent<callbackWithTimeStamp>}
     */
    pageManager.onPageVisitStop = createEvent();

    /**
     * An event that is fired when the page attention state changes.
     * @type {PageManagerEvent<callbackWithTimeStamp>}
     */
    pageManager.onPageAttentionUpdate = createEvent();

    /**
     * An event that is fired when the page attention state changes.
     * @type {PageManagerEvent<callbackWithTimeStamp>}
     */
    pageManager.onPageAudioUpdate = createEvent();

    /**
     * Send a message to the background page, with a catch because errors can
     * occur in `browser.runtime.sendMessage` when the page is unlooading.
     * @param {object} message - The message to send, which should be an object with
     * a type string.
     */
    pageManager.sendMessage = function(message) {
        try {
            browser.runtime.sendMessage(message).catch((reason) => {
                debugLog(`Error when sending message from content script to background page: ${JSON.stringify(message)}`);
            });
        }
        catch(error) {
            debugLog(`Error when sending message from content script to background page: ${JSON.stringify(message)}`);
        }
    };

    /**
     * The function for firing the page visit start event, which runs whenever a new page
     * loads. A page load might be because of ordinary web navigation (i.e., loading a new
     * HTML document with a base HTTP(S) request) or because the URL changed via the History
     * API.
     * @private
     * @param {number} timeStamp - The time when the underlying event fired.
     * @param {boolean} [isHistoryChange=false] - Whether this page load was caused by the
     * History API.
     */
    function pageVisitStart(timeStamp, isHistoryChange = false) {
        // Assign a new page ID
        pageManager.pageId = generateId();
        // Store a copy of the URL, because we use it to check for History API page loads
        pageManager.url = locationHrefWithoutHash();
        // Store a copy of the referrer for convenience
        pageManager.referrer = document.referrer.repeat(1);
        pageManager.pageVisitStartTime = timeStamp;
        // If this is a History API page load, persist the states for attention and audio
        pageManager.pageHasAttention = isHistoryChange ? pageManager.pageHasAttention : false;
        pageManager.pageHasAudio = isHistoryChange ? pageManager.pageHasAudio : false;
        // Store whether the page visit event has completed firing
        pageManager.pageVisitStarted = false;

        // Send the page visit start event to the background page
        pageManager.sendMessage({
            type: "webScience.pageManager.pageVisitStart",
            pageId: pageManager.pageId,
            url: pageManager.url,
            referrer: pageManager.referrer,
            timeStamp: pageManager.pageVisitStartTime,
            privateWindow: browser.extension.inIncognitoContext,
            isHistoryChange
        });

        // Notify the page visit start event listeners in the content script environment
        pageManager.onPageVisitStart.notifyListeners([{
            timeStamp,
            isHistoryChange
        }]);

        pageManager.pageVisitStarted = true;

        debugLog(`Page visit start: ${JSON.stringify(pageManager)}`);
    }

    /**
     * The function for firing the page visit stop event, which runs whenever a page closes.
     * That could be because of browser exit, tab closing, tab navigation to a new page, or
     * a new page loading via the History API.
     * @private
     * @param {number} timeStamp - The time when the underlying event fired.
     */
    function pageVisitStop(timeStamp) {
        // Send the page visit stop event to the background page
        pageManager.sendMessage({
            type: "webScience.pageManager.pageVisitStop",
            pageId: pageManager.pageId,
            url: pageManager.url,
            referrer: pageManager.referrer,
            timeStamp,
            pageVisitStartTime: pageManager.pageVisitStartTime,
            privateWindow: browser.extension.inIncognitoContext
        });

        // Notify the page visit stop event listeners in the content script environment
        pageManager.onPageVisitStop.notifyListeners([{
            timeStamp
        }]);

        debugLog(`Page visit stop: ${JSON.stringify(pageManager)}`);
    }

    /**
     * The function for firing the page attention update event, which runs whenever the
     * page attention state might have changed. The function contains logic to verify
     * that the attention state actually changed before firing the event.
     * @param {number} timeStamp - The time when the underlying event fired.
     * @param {boolean} pageHasAttention - The latest attention state, according to the
     * pageManager module running in the background page.
     */
    function pageAttentionUpdate(timeStamp, pageHasAttention) {
        if(pageManager.pageHasAttention === pageHasAttention)
            return;

        pageManager.pageHasAttention = pageHasAttention;

        // Notify the page attention update event listeners in the content script environment
        pageManager.onPageAttentionUpdate.notifyListeners([{
            timeStamp
        }]);

        debugLog(`Page attention update: ${JSON.stringify(pageManager)}`);
    }

    /**
     * The function for firing the page audio update event, which runs whenever the
     * page audio state might have changed. The function contains logic to verify
     * that the audio state actually changed before firing the event.
     * @param {number} timeStamp - The time when the underlying event fired.
     * @param {boolean} pageHasAudio - The latest audio state, according to the
     * pageManager module running in the background page.
     */
    function pageAudioUpdate(timeStamp, pageHasAudio) {
        if(pageManager.pageHasAudio === pageHasAudio)
            return;

        pageManager.pageHasAudio = pageHasAudio;

        // Notify the page audio update event listeners in the content script environment
        pageManager.onPageAudioUpdate.notifyListeners([{
            timeStamp
        }]);

        debugLog(`Page audio update: ${JSON.stringify(pageManager)}`);
    }

    // Handle events sent from the background page
    browser.runtime.onMessage.addListener((message) => {
        if(message.type === "webScience.pageManager.pageAttentionUpdate") {
            pageAttentionUpdate(message.timeStamp, message.pageHasAttention);
            return;
        }

        // If the background page detected a URL change, this could be belated
        // notification about a conventional navigation or it could be a page
        // load via the History API
        // We can distinguish these two scenarios by checking whether the URL
        // visible to the user (`window.location.href`) has changed since the
        // page visit start
        if((message.type === "webScience.pageManager.urlChanged") &&
            (locationHrefWithoutHash() !== pageManager.url)) {
            pageVisitStop(message.timeStamp);
            pageVisitStart(message.timeStamp, true);
            return;
        }

        if(message.type === "webScience.pageManager.pageAudioUpdate") {
            pageAudioUpdate(message.timeStamp, message.pageHasAudio);
            return;
        }
    });

    // If there are any other content scripts that are waiting for the API to load,
    // execute the callbacks for those content scripts
    if("pageManagerHasLoaded" in window) {
        if(Array.isArray(window.pageManagerHasLoaded))
            for(const callback of window.pageManagerHasLoaded)
                if(typeof callback === "function") {
                    try {
                        callback();
                    }
                    catch(error) {
                        debugLog(`Error in callback for pageManager load: ${error}`);
                    }
                }
        delete window.pageManagerHasLoaded;
    }

    // Send the page visit start event for the first time
    pageVisitStart(Math.floor(window.performance.timeOrigin));

    // Send the page visit stop event on the window unload event
    window.addEventListener("unload", (event) => {
        pageVisitStop(Date.now());
    });
    
})();
