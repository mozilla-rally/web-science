/**
 * This module enabled measurement of the user's exposure to links.
 *
 * @module webScience.linkExposure
 */

import * as events from "./events.js";
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
 * The details of a link exposure event.
 * @typedef {Object} LinkExposureDataDetails
 * @property {number} pageId - The ID for the page, unique across browsing sessions.
 * @property {string} url - The URL of the page, without any hash.
 * @property {string[]} matchingLinkUrls - An array containing the resolved URLs of links
 * on the page that the user was exposed to and that matched a provided match pattern.
 * @property {number} nonmatchingLinkCount - The number of resolved links on the page that
 * the user was exposed to and that did not match a provided match pattern.
 */

/**
 * A callback function for the page data event.
 * @callback linkExposureDataListener
 * @param {LinkExposureDataDetails} details - Additional information about the page data event.
 */

/**
 * @typedef {Object} LinkExposureDataOptions
 * @property {string[]} linkMatchPatterns - Match patterns for links where the listener
 * should receive individual resolved URLs. Links that do not match this match pattern are
 * included in an aggregate count.
 * @property {string[]} pageMatchPatterns - Match patterns for pages where the listener
 * should be provided link exposure data.
 * @property {boolean} [privateWindows=false] - Whether to measure links in private windows.
 */

/**
 * @typedef {Object} LinkExposureDataListenerRecord
 * @property {matching.MatchPatternSet} linkMatchPatternSet - The match patterns for link URLs.
 * @property {matching.MatchPatternSet} pageMatchPatternSet - The match patterns for pages.
 * @property {boolean} privateWindows - Whether to report exposures in private windows.
 * @property {browser.contentScripts.RegisteredContentScript} contentScript - The content
 * script associated with the listener.
 */

/**
 * A map where each key is a listener function and each value is a record for that listener function.
 * @constant {Map<linkExposureDataListener, LinkExposureDataListenerRecord}
 */
const linkExposureDataListeners = new Map();

/**
 * @callback LinkExposureDataAddListener
 * @param {linkExposureDataListener} listener - The listener to add.
 * @param {LinkExposureDataOptions} options - Options for the listener.
 */

/**
 * @callback LinkExposureDataRemoveListener
 * @param {linkExposureDataListener} listener - The listener to remove.
 */

/**
 * @callback LinkExposureDataHasListener
 * @param {linkExposureDataListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * @callback LinkExposureDataHasAnyListeners
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * @typedef {Object} LinkExposureDataEvent
 * @property {LinkExposureDataAddListener} addListener - Add a listener for idle state changes.
 * @property {LinkExposureDataRemoveListener} removeListener - Remove a listener for idle state changes.
 * @property {LinkExposureDataHasListener} hasListener - Whether a specified listener has been added.
 * @property {LinkExposureDataHasAnyListeners} hasAnyListeners - Whether the event has any listeners.
 */

/**
 * An event that fires when data about link exposures on a page is available. This event can fire multiple
 * times for one page, as link exposures occur and the URLs for those links are resolved.
 * @constant {LinkExposureEvent}
 */
export const onLinkExposureData = events.createEvent({
    addListenerCallback: addListener,
    removeListenerCallback: removeListener,
    notifyListenersCallback: () => { return false; }
});

/**
 * Whether the messaging.onMessage listener has been added.
 * @type {boolean}
 */
let addedMessageListener = false;

/**
 * Callback for adding an onLinkExposureData listener.
 * @param {linkExposureDataListener} listener - The listener function.
 * @param {LinkExposureOptions} options - A set of options for the measurement.
 * @private
 */
async function addListener(listener, { linkMatchPatterns, pageMatchPatterns, privateWindows = false }) {
    // Initialization
    await pageManager.initialize();
    if(!addedMessageListener) {
        messaging.onMessage.addListener(messageListener, {
            type: "webScience.linkExposure.linkExposureUpdate",
            schema: {
                pageId: "string",
                url: "string",
                privateWindow: "boolean",
                linkUrls: "object"
            }
        });
        addedMessageListener = true;
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
    linkExposureDataListeners.set(listener, {
        linkMatchPatternSet,
        pageMatchPatternSet,
        privateWindows,
        contentScript
    });
}

/**
 * Callback for removing an onLinkExposureData listener.
 * @param {linkExposureCallback} listener - The listener that is being removed.
 * @private
 */
function removeListener(listener) {
    // If the listener has a record, unregister its content script and delete
    // the record
    const listenerRecord = linkExposureDataListeners.get(listener);
    if(listenerRecord !== undefined) {
        listenerRecord.contentScript.unregister();
        linkExposureDataListeners.delete(listener);
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
 */
function messageListener({ pageId, url, privateWindow, linkUrls }) {
    // Resolve all the link URLs in the update
    const resolvedLinkUrlPromises = linkUrls.map((linkUrl) => {
        return linkResolution.resolveUrl(linkUrl);
    });

    // Once resolution is complete, notify the linkExposureData listeners
    Promise.allSettled(resolvedLinkUrlPromises).then(async (results) => {
        // For each link URL, if we have a resolved URL, use that
        // If we don't have a resolved URL, use the original URL with
        // cache, shim, and link decoration parsing
        for(let i = 0; i < linkUrls.length; i++) {
            if(results[i].status === "fulfilled") {
                linkUrls[i] = results[i].value;
            }
            else {
                linkUrls[i] = await linkResolution.resolveUrl(linkUrls[i], { request: "none" });
            }
        }

        // Notify the listeners
        for(const [listener, listenerRecord] of linkExposureDataListeners) {
            // Check private window and page match pattern requirements for the listener
            if((!privateWindow || listenerRecord.privateWindows) &&
            listenerRecord.pageMatchPatternSet.matches(url)) {
                const matchingLinkUrls = [];
                let nonmatchingLinkCount = 0;
                for(const linkUrl of linkUrls) {
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
    });
}
