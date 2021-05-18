/**
 * This module enables measuring user exposure to linked content. See the
 * `onLinkExposureData` and `onLinkExposureUpdate` events for specifics.
 * There is an important difference between these events: `onLinkExposureData`
 * fires once per page with a complete set of link exposure data, while
 * `onLinkExposureUpdate` fires throughout a page's lifespan as link exposures
 * occur. For most use cases, `onLinkExposureData` is the right event to use.
 *
 * @module linkExposure
 */

import * as events from "./events.js";
import * as linkResolution from "./linkResolution.js";
import * as matching from "./matching.js";
import * as messaging from "./messaging.js";
import * as pageManager from "./pageManager.js";
import * as inline from "./inline.js";
import * as permissions from "./permissions.js";
import linkExposureContentScript from "./content-scripts/linkExposure.content.js";

/**
 * Ignore links where the link URL PS+1 is identical to the page URL PS+1.
 * Note that there is another ignoreSelfLinks constant in the linkExposure
 * content script, and these two constants should have the same value.
 * @constant {boolean}
 * @private
 */
const ignoreSelfLinks = true;

/**
 * The details of a link exposure update event. This private type must be kept in
 * sync with the public `linkExposureUpdateListener` type.
 * @typedef {Object} LinkExposureUpdateDetails
 * @property {string} pageId - The ID for the page, unique across browsing sessions.
 * @property {string} url - The URL of the page, without any hash.
 * @property {string[]} matchingLinkUrls - An array containing the resolved URLs of links
 * on the page that the user was exposed to and that matched a provided match pattern.
 * @property {number} nonmatchingLinkCount - The number of resolved links on the page that
 * the user was exposed to and that did not match a provided match pattern.
 * @private
 */

/**
 * A listener for the `onLinkExposureUpdate` event.
 * @callback linkExposureUpdateListener
 * @memberof module:linkExposure.onLinkExposureUpdate
 * @param {Object} details - Additional information about the link
 * exposure update event.
 * @param {string} details.pageId - The ID for the page, unique across browsing sessions.
 * @param {string} details.url - The URL of the page, without any hash.
 * @param {string[]} details.matchingLinkUrls - An array containing the resolved URLs of links
 * on the page that the user was exposed to and that matched a provided match pattern.
 * @param {number} details.nonmatchingLinkCount - The number of resolved links on the page that
 * the user was exposed to and that did not match a provided match pattern.
 */

/**
 * Options when adding a listener for the `onLinkExposureUpdate` event. This
 * private type must be kept in sync with the public `onLinkExposureUpdate.addListener`
 * type.
 * @typedef {Object} LinkExposureUpdateOptions
 * @property {string[]} linkMatchPatterns - Match patterns for links where the listener
 * should receive individual resolved URLs. Links that do not match this match pattern are
 * included in an aggregate count.
 * @property {string[]} pageMatchPatterns - Match patterns for pages where the listener
 * should be provided link exposure data.
 * @property {boolean} [privateWindows=false] - Whether to measure links in private windows.
 * @private
 */

/**
 * @typedef {Object} LinkExposureUpdateListenerRecord
 * @property {matching.MatchPatternSet} linkMatchPatternSet - The match patterns for link URLs.
 * @property {matching.MatchPatternSet} pageMatchPatternSet - The match patterns for pages.
 * @property {boolean} privateWindows - Whether to report exposures in private windows.
 * @property {browser.contentScripts.RegisteredContentScript} contentScript - The content
 * script associated with the listener.
 * @private
 */

/**
 * A map where each key is a listener and each value is a record for that listener.
 * @constant {Map<linkExposureUpdateListener, LinkExposureUpdateListenerRecord>}
 * @private
 */
const linkExposureUpdateListeners = new Map();

/**
 * A map where each key is a page ID and each value is a count of pending page link exposure updates
 * waiting on link resolution.
 * @constant {Map<string, number>}
 * @private
 */
const pendingPageLinkExposureUpdates = new Map();

/**
 * A map where each key is a page ID and each value is a callback function that is fired when there
 * are no more pending link exposure updates for the page ID.
 * @constant {Map<string, Function>}
 * @private
 */
const pendingPageLinkExposureCallbacks = new Map();

/**
 * Add a listener for the `onLinkExposureUpdate` event.
 * @function addListener
 * @memberof module:linkExposure.onLinkExposureUpdate
 * @param {linkExposureUpdateListener} listener - The listener to add.
 * @param {Object} options - Options for the listener.
 * @param {string[]} options.linkMatchPatterns - Match patterns for links where the listener
 * should receive individual resolved URLs. Links that do not match this match pattern are
 * included in an aggregate count.
 * @param {string[]} options.pageMatchPatterns - Match patterns for pages where the listener
 * should be provided link exposure data.
 * @param {boolean} [options.privateWindows=false] - Whether to measure links in private windows.
 */

/**
 * Remove a listener for the `onLinkExposureUpdate` event.
 * @function removeListener
 * @memberof module:linkExposure.onLinkExposureUpdate
 * @param {linkExposureUpdateListener} listener - The listener to remove.
 */

/**
 * Whether a specified listener has been added for the `onLinkExposureUpdate` event.
 * @function hasListener
 * @memberof module:linkExposure.onLinkExposureUpdate
 * @param {linkExposureUpdateListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * Whether the `onLinkExposureUpdate` event has any listeners.
 * @function hasAnyListeners
 * @memberof module:linkExposure.onLinkExposureUpdate
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * An event that fires when data about link exposures on a page is available. This event can fire multiple
 * times for one page, as link exposures occur and the URLs for those links are resolved.
 * @namespace
 */
export const onLinkExposureUpdate = events.createEvent({
    name: "webScience.linkExposure.onLinkExposureUpdate",
    addListenerCallback: addUpdateListener,
    removeListenerCallback: removeUpdateListener,
    notifyListenersCallback: () => { return false; }
});

/**
 * Whether the module has been initialized by checking permissions and adding a
 * messaging.onMessage listener.
 * @type {boolean}
 * @private
 */
let initialized = false;

/**
 * Callback for adding an onLinkExposureUpdate listener.
 * @param {linkExposureUpdateListener} listener - The listener.
 * @param {LinkExposureUpdateOptions} options - A set of options for the listener.
 * @private
 */
async function addUpdateListener(listener, { linkMatchPatterns, pageMatchPatterns, privateWindows = false }) {
    // Initialization
    await pageManager.initialize();
    if(!initialized) {
        initialized = true;
        
        permissions.check({
            module: "webScience.linkExposure",
            requiredPermissions: [ "storage" ],
            suggestedPermissions: [ "unlimitedStorage" ]
        });

        messaging.onMessage.addListener(messageListener, {
            type: "webScience.linkExposure.linkExposureUpdate",
            schema: {
                pageId: "string",
                url: "string",
                privateWindow: "boolean",
                linkUrls: "object"
            }
        });
    }

    // Compile the match patterns for link URLs and page URLs
    const linkMatchPatternSet = matching.createMatchPatternSet(linkMatchPatterns);
    const pageMatchPatternSet = matching.createMatchPatternSet(pageMatchPatterns);

    // Register a content script for the page URLs
    const contentScript = await browser.contentScripts.register({
        matches: pageMatchPatterns,
        js: [{
            code: inline.dataUrlToString(linkExposureContentScript)
        }],
        runAt: "document_idle"
    });

    // Store the listener information in a record
    linkExposureUpdateListeners.set(listener, {
        linkMatchPatternSet,
        pageMatchPatternSet,
        privateWindows,
        contentScript
    });
}

/**
 * Callback for removing an onLinkExposureUpdate listener.
 * @param {linkExposureUpdateListener} listener - The listener that is being removed.
 * @private
 */
function removeUpdateListener(listener) {
    // If the listener has a record, unregister its content script and delete
    // the record
    const listenerRecord = linkExposureUpdateListeners.get(listener);
    if(listenerRecord !== undefined) {
        listenerRecord.contentScript.unregister();
        linkExposureUpdateListeners.delete(listener);
    }
}

/**
 * Callback for a link exposure update message from the content script.
 * @param {Options} linkExposureUpdate - The update message.
 * @param {string} linkExposureUpdate.pageId - The page ID for the page where
 * the content script is running.
 * @param {string} linkExposureUpdate.url - The URL, without a hash, for the page
 * where the content script is running.
 * @param {boolean} linkExposureUpdate.privateWindow - Whether the page where the
 * content script is running is in a private window.
 * @param {string[]} linkExposureUpdate.linkUrls - The links on the page that the
 * user was exposed to.
 * @private
 */
function messageListener({ pageId, url, privateWindow, linkUrls }) {
    // Increment the count of pending link exposure updates for the page
    let pendingLinkExposureCount = pendingPageLinkExposureUpdates.get(pageId);
    pendingLinkExposureCount = pendingLinkExposureCount === undefined ? 1 : pendingLinkExposureCount + 1;
    pendingPageLinkExposureUpdates.set(pageId, pendingLinkExposureCount);

    // Resolve all the link URLs in the update, converting each URL into a
    // Promise<string>
    const resolvedLinkUrlPromises = linkUrls.map((linkUrl) => {
        return linkResolution.resolveUrl(linkUrl);
    });

    // Once resolution is complete, notify the linkExposureUpdate listeners
    Promise.allSettled(resolvedLinkUrlPromises).then(async (results) => {
        // For each link URL, if we have a resolved URL, use that
        // If we don't have a resolved URL, use the original URL with
        // cache, shim, and link decoration parsing
        for(const i of linkUrls.keys()) {
            if(results[i].status === "fulfilled") {
                linkUrls[i] = results[i].value;
            }
            else {
                linkUrls[i] = await linkResolution.resolveUrl(linkUrls[i], { request: "none" });
            }
        }

        // If we are ignoring self links, determine whether each link URL is a self link
        // by comparing to the page URL's public suffix + 1
        // These are links that do not appear to be self links in the content
        // script, but resolve to self links
        let selfLinks = null;
        if(ignoreSelfLinks) {
            const pagePS1 = linkResolution.urlToPS1(url);
            selfLinks = linkUrls.map(linkUrl => pagePS1 === linkResolution.urlToPS1(linkUrl))
        }

        // Notify the listeners
        for(const [listener, listenerRecord] of linkExposureUpdateListeners) {
            // Check private window and page match pattern requirements for the listener
            if((!privateWindow || listenerRecord.privateWindows) &&
            listenerRecord.pageMatchPatternSet.matches(url)) {
                const matchingLinkUrls = [];
                let nonmatchingLinkCount = 0;
                for(const i of linkUrls.keys()) {
                    // If we are ignoring self links and a resolved link URL is a self link,
                    // ignore the resolved link URL
                    if(ignoreSelfLinks && selfLinks[i]) {
                        continue;
                    }
                    // Queue the link for reporting to the listener, either as a URL (if matching)
                    // or in a count (if nonmatching)
                    const linkUrl = linkUrls[i];
                    if(listenerRecord.linkMatchPatternSet.matches(linkUrl)) {
                        matchingLinkUrls.push(linkUrl);
                    }
                    else {
                        nonmatchingLinkCount++;
                    }
                }
                listener({
                    pageId,
                    url,
                    matchingLinkUrls,
                    nonmatchingLinkCount
                });
            }
        }

        // Decrement the count of pending link exposure updates for the page
        pendingLinkExposureCount = pendingPageLinkExposureUpdates.get(pageId) - 1;
        if(pendingLinkExposureCount > 0) {
            pendingPageLinkExposureUpdates.set(pageId, pendingLinkExposureCount);
        }
        else {
            pendingPageLinkExposureUpdates.delete(pageId);
        }
        // If there are no more pending link exposures for the page and there's a
        // callback for when the page has no more pending link exposures, call the
        // callback and remove it
        if(pendingLinkExposureCount <= 0) {
            const callback = pendingPageLinkExposureCallbacks.get(pageId);
            if(callback !== undefined) {
                callback();
            }
            pendingPageLinkExposureCallbacks.delete(pageId);
        }
    });
}

/**
 * The details of a link exposure data event. This private type must be kept in sync with
 * the public `linkExposureDataListener` type.
 * @typedef {Object} LinkExposureDataDetails
 * @property {string} pageId - The ID for the page, unique across browsing sessions.
 * @property {string} url - The URL of the page, without any hash.
 * @property {string[]} matchingLinkUrls - An array containing the resolved URLs of links
 * on the page that the user was exposed to and that matched a provided match pattern.
 * @property {number} nonmatchingLinkCount - The number of resolved links on the page that
 * the user was exposed to and that did not match a provided match pattern.
 * @private
 */

/**
 * A callback function for the link exposure data event.
 * @callback linkExposureDataListener
 * @memberof module:linkExposure.onLinkExposureData
 * @param {Object} details - Additional information about the link exposure date event.
 * @param {string} details.pageId - The ID for the page, unique across browsing sessions.
 * @param {string} details.url - The URL of the page, without any hash.
 * @param {string[]} details.matchingLinkUrls - An array containing the resolved URLs of links
 * on the page that the user was exposed to and that matched a provided match pattern.
 * @param {number} details.nonmatchingLinkCount - The number of resolved links on the page that
 * the user was exposed to and that did not match a provided match pattern.
 */

/**
 * Options when adding a listener for the `onLinkExposureData` event. This private type must
 * be kept in sync with the public `onLinkExposureData.addListener` type.
 * @typedef {Object} LinkExposureDataOptions
 * @property {string[]} linkMatchPatterns - Match patterns for links where the listener
 * should receive individual resolved URLs. Links that do not match this match pattern are
 * included in an aggregate count.
 * @property {string[]} pageMatchPatterns - Match patterns for pages where the listener
 * should be provided link exposure data.
 * @property {boolean} [privateWindows=false] - Whether to measure links in private windows.
 * @private
 */

/**
 * @typedef {Object} LinkExposureDataListenerRecord
 * @property {linkExposureUpdateListener} linkExposureUpdateListener - The listener for onLinkExposureUpdate
 * that was created for this onLinkExposureData listener.
 * @property {Map<string,LinkExposureDataDetails>} pageLinkExposureData - A map where keys are page IDs and values
 * are LinkExposureDataDetails reflecting partial link exposure data for a page.
 * @private
 */

/**
 * A map where each key is a listener and each value is a record for that listener.
 * @constant {Map<linkExposureDataListener, LinkExposureDataListenerRecord>}
 * @private
 */
const linkExposureDataListeners = new Map();

/**
 * Add a listener for the `onLinkExposureData` event.
 * @function addListener
 * @memberof module:linkExposure.onLinkExposureData
 * @param {linkExposureDataListener} listener - The listener to add.
 * @param {Object} options - Options for the listener.
 * @param {string[]} options.linkMatchPatterns - Match patterns for links where the listener
 * should receive individual resolved URLs. Links that do not match this match pattern are
 * included in an aggregate count.
 * @param {string[]} options.pageMatchPatterns - Match patterns for pages where the listener
 * should be provided link exposure data.
 * @param {boolean} [options.privateWindows=false] - Whether to measure links in private windows.
 */

/**
 * Remove a listener for the `onLinkExposureData` event.
 * @function removeListener
 * @memberof module:linkExposure.onLinkExposureData
 * @param {linkExposureDataListener} listener - The listener to remove.
 */

/**
 * Whether a specified listener has been added for the `onLinkExposureData` event.
 * @function hasListener
 * @memberof module:linkExposure.onLinkExposureData
 * @param {linkExposureDataListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * Whether the `onLinkExposureData` event has any listeners.
 * @function hasAnyListeners
 * @memberof module:linkExposure.onLinkExposureData
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * Whether the pageManager.onPageVisitStart and pageManager.onPageVisitStop listeners have been added.
 * @type {boolean}
 * @private
 */
let addedPageVisitListeners = false;
 
/**
 * An event that fires when a complete set of data about link exposures on a page is available. This event
 * only fires once per page, after the page visit has ended.
 * @namespace
 */
export const onLinkExposureData = events.createEvent({
    name: "webScience.linkExposure.onLinkExposureData",
    addListenerCallback: addDataListener,
    removeListenerCallback: removeDataListener,
    notifyListenersCallback: () => { return false; }
});

/**
 * A short period of time to wait, in milliseconds, after the onPageVisitStop event before attempting the
 * onLinkExposureData event. We need to wait a short period because there can be lingering
 * onLinkExposureUpdate events after onPageVisitStop (e.g., links that are still getting resolved or a
 * final message from the linkExposure content script when the page visit ends).
 * @constant {number}
 * @private
 */
const pageVisitStopDelay = 500;

/**
 * Callback for adding an onLinkExposureData listener.
 * @param {linkExposureDataListener} listener - The listener.
 * @param {LinkExposureDataOptions} options - A set of options for the listener.
 * @private
 */
async function addDataListener(listener, options) {
    if(!addedPageVisitListeners) {
        // When a page visit starts, for each link exposure data listener with a matching page match pattern,
        // create an object to accumulate link exposures on that page
        pageManager.onPageVisitStart.addListener(pageVisitStartDetails => {
            for(const linkExposureDataListenerRecord of linkExposureDataListeners.values()) {
                const linkExposureUpdateListenerRecord = linkExposureUpdateListeners.get(linkExposureDataListenerRecord.linkExposureUpdateListener);
                if(linkExposureUpdateListenerRecord.pageMatchPatternSet.matches(pageVisitStartDetails.url)) {
                    linkExposureDataListenerRecord.pageLinkExposureData.set(pageVisitStartDetails.pageId, {
                        pageId: pageVisitStartDetails.pageId,
                        url: pageVisitStartDetails.url,
                        matchingLinkUrls: [],
                        nonmatchingLinkCount: 0
                    });
                }
            }
        });

        // When a page visit ends, wait a short period because link resolution might still be pending
        pageManager.onPageVisitStop.addListener(pageVisitStopDetails => {
            setTimeout(() => {
                // Create a callback function to notify onPageVisitData listeners about the link exposures on the page
                // and delete the store of aggregated link exposures
                const notifyListeners = () => {
                    for(const [linkExposureDataListener, linkExposureDataListenerRecord] of linkExposureDataListeners) {
                        const linkExposureDataForPage = linkExposureDataListenerRecord.pageLinkExposureData.get(pageVisitStopDetails.pageId);
                        // If there's at least one link exposure to report on the page, notify the listener
                        if(linkExposureDataForPage !== undefined) {
                            if((linkExposureDataForPage.matchingLinkUrls.length > 0) || (linkExposureDataForPage.nonmatchingLinkCount > 0)) {
                                linkExposureDataListener(linkExposureDataForPage);
                            }
                            // Delete the listener's accumulated link exposure data for the page
                            linkExposureDataListenerRecord.pageLinkExposureData.delete(pageVisitStopDetails.pageId);
                        }
                    }
                };
                // If there are no pending link exposure updates for the page, immediately call the callback function
                if(!pendingPageLinkExposureUpdates.has(pageVisitStopDetails.pageId)) {
                    notifyListeners();
                }
                // Otherwise, set the callback function to be called when there are no more pending link exposures for
                // the page
                else {
                    pendingPageLinkExposureCallbacks.set(pageVisitStopDetails.pageId, notifyListeners);
                }
            }, pageVisitStopDelay);
        });
        addedPageVisitListeners = true;
    }

    // Create a record of the onLinkExposureData listener, including a new onLinkExposureUpdate listener
    const linkExposureDataListenerRecord = {
        pageLinkExposureData: new Map(),
        // When the onLinkExposureUpdate listener fires for this onLinkExposureData listener, accumulate
        // the link exposures on the page for this listener
        linkExposureUpdateListener: linkExposureUpdateDetails => {
            const linkExposureDataForPage = linkExposureDataListenerRecord.pageLinkExposureData.get(linkExposureUpdateDetails.pageId);
            if(linkExposureDataForPage !== undefined) {
                linkExposureDataForPage.matchingLinkUrls = linkExposureDataForPage.matchingLinkUrls.concat(linkExposureUpdateDetails.matchingLinkUrls);
                linkExposureDataForPage.nonmatchingLinkCount += linkExposureUpdateDetails.nonmatchingLinkCount;
            }
        }
    };
    linkExposureDataListeners.set(listener, linkExposureDataListenerRecord);
    onLinkExposureUpdate.addListener(linkExposureDataListenerRecord.linkExposureUpdateListener, options);
}

/**
 * Callback for removing an onLinkExposureData listener.
 * @param {linkExposureDataListener} listener - The listener that is being removed.
 * @private
 */
function removeDataListener(listener) {
    // If the listener has a record, unregister its onLinkExposureUpdate listener
    // and delete the record
    const listenerRecord = linkExposureDataListeners.get(listener);
    if(listenerRecord !== undefined) {
        onLinkExposureUpdate.removeListener(listenerRecord.linkExposureUpdateListener);
        linkExposureDataListeners.delete(listener);
    }
}
