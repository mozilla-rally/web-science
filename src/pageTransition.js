/**
 * This module enables observing webpage transitions, synthesizing a range of
 * transition data that may be valuable for browser-based studies. See the
 * `onPageTransitionData` event for details.
 * 
 * # Types of Page Transition Data
 * This module supports several types of page transition data. Some types are
 * supported and recommended, because the data is consistently available, has
 * consistent meaning, and reflects discrete categories of user interactions.
 * Other types of transition data are supported because they appear in prior
 * academic literature, but we  do not recommend them because of significant
 * limitations.
 *   * Supported and Recommended Types of Page Transition Data
 *     * WebExtensions Transitions - This module reports the same webpage
 *       transition data provided by the WebExtensions `webNavigation` API. There
 *       are two types of transition data: `TransitionType` (e.g., "link" or
 *       "typed") and `TransitionQualifier` (e.g., "from_address_bar" or
 *       "forward_back"). Note that Firefox's support for these values is mostly
 *       but not entirely complete and defaults to a "link" transition type. We
 *       recommend checking click transition data to confirm whether the user
 *       clicked on a link.
 *     * Tab-based Transitions - This module reports the webpage that was
 *       previously loaded in a new webpage's tab. If the webpage is loading in a
 *       newly created tab, this module reports the webpage that was open in
 *       the opener tab. We recommend using tab-based transition data when the user
 *       has clicked a link (according to both WebExtensions and click data), when
 *       the user has navigated with forward and back buttons, and when the page
 *       has refreshed (due to user action or automatically). In these situations,
 *       there is a clear causal relationship between the previous and current
 *       pages. We do not otherwise recommend using tab-based transition data,
 *       because the user might be reusing a tab for reasons unrelated to the page
 *       loaded in the tab.
 *     * Click Transitions - This module reports when a click on a webpage is
 *       immediately followed by a new webpage loading in the same tab (or a
 *       newly opened tab were that tab is the opener). This activity indicates
 *       the user likely clicked a link, and it compensates for limitations in
 *       how browsers detect link clicks for the `webNavigation` API.
 *   * Supported But Not Recommended Types of Page Transition Data   
 *     * Referrers - This module reports the HTTP referrer for each new page. While
 *       referrers have long been a method for associating webpage loads with
 *       prior pages, they are not consistently available (webpages and browsers
 *       are increasingly limiting when referrers are sent), do not have consistent
 *       content (similarly, webpages and browsers are increasingly limiting
 *       referrers to just origins), and do not have consistent meaning (the rules
 *       for setting referrers are notoriously complex and can have nonintuitive
 *       semantics). Be especially careful with referrers for webpage loads via
 *       the History API---because there is no new document-level HTTP request, the
 *       referrer will not change when the URL changes.
 *     * Time-based Transitions - This module reports the most recent webpage that
 *       loaded in any tab. We do not recommend relying on this data, because a
 *       chronological ordering of webpage loads may have no relation to user
 *       activity or perception (e.g., a webpage might automatically reload in the
 *       background before a user navigates to a new page).
 *  
 * # Page Transition Data Sources
 * This module builds on the page tracking provided by the `pageManager`
 * module and uses browser events, DOM events, and a set of heuristics to
 * associate transition information with each page visit. The module relies on
 * the following sources of data about page transitions:
 *   * Background Script Data Sources
 *     * `webNavigation.onCommitted` - provides tab ID, url,
 *       `webNavigation.TransitionType`, and `webNavigation.TransitionQualifier`
 *       values when a new page is loading in a tab.
 *     * `webNavigation.onDOMContentLoaded` - provides tab ID, url, and a
 *       timestamp approximating when the `DOMContentLoaded` event fired on a
 *       page.
 *     * `webNavigation.onHistoryStateUpdated` - provides tab ID, url,
 *       `webNavigation.TransitionType`, and `webNavigation.TransitionQualifier`
 *       values when a new page loads in a tab via the History API.
 *     * `webNavigation.onCreatedNavigationTarget` - provides tab ID, source
 *       tab ID, and url whan a new tab is created to load a page.
 *     * `pageManager.onPageVisitStart` - provides tab ID, page ID, and url
 *       when a page loads in a tab.
 *   * Content Script Data Sources
 *     * The `click` event on the `document` element - detects possible link
 *       clicks via the mouse.
 *     * The `keyup` event on the document element - detects possible link
 *       clicks via the keyboard.
 *     * `pageManager.onPageVisitStart` - provides page ID and whether the page
 *       visit is a History API URL change.
 *     * `pageManager.pageHasAttention` - provides the page's current attention
 *       state.
 * 
 * # Combining Data Sources into a Page Transition
 * Merging these data sources into a page transition event poses several
 * challenges.
 *   * We have to sync background script `webNavigation` events with content
 *     scripts. As with `pageManager`, we have to account for the possibility
 *     of race conditions between the background script and content script
 *     environments. We use the same general approach in this module as in
 *     `pageManager`, converting background script events into messages posted
 *     to content scripts. We have to be a bit more careful about race
 *     condititions than in `pageManager`, though, because if a tab property
 *     event handled in that module goes to the wrong content script the
 *     consequences are minimal (because correct event data will quickly
 *     arrive afterward). In this module, by contrast, an error could mean 
 *     incorrectly associating a pair of pages. We further account for the
 *     possibility of race conditions by matching the `webNavigation` URL and
 *     DOMContentLoaded timestamp with the content script's URL and
 *     DOMContentLoaded timestamp.
 *   * We have to sync background script `webNavigation` events for different
 *     stages in the webpage loading lifecycle, because we want properties of
 *     both `webNavigation.onCommitted` and `webNavigation.onDOMContentLoaded`:
 *     the former has transition types and qualifiers, while the latter has a
 *     timestamp that is comparable to an event in the content script and does
 *     not have the risk of firing before the content script is ready to
 *     receive messages. Unlike `webRequest` events, `webNavigation` events are
 *     not associated with unique identifiers. We accomplish syncing across
 *     events by assuming that when the `webNavigation.onDOMContentLoaded` event
 *     fires for a tab, it is part of the same navigation lifecycle as the most
 *     recent `webNavigation.onCommitted` event in the tab.
 *   * We have to sync content script data for a page with content script
 *     data for a prior page (either loaded in the same tab, loaded in an
 *     opener tab, or loaded immediately before in time). We accomplish this by
 *     maintaining a cache of page visit data and assuming that page visit
 *     event ordering is preserved by the background page event loop.
 *  
 * @see {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation/onCommitted}
 * @see {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation/TransitionType}
 * @see {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation/TransitionQualifier}
 * @see {@link https://github.com/mdn/browser-compat-data/issues/9019}
 * @see {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onCreated}
 * @module webScience.pageTransition
 */

import * as events from "./events.js";
import * as permissions from "./permissions.js";
import * as messaging from "./messaging.js";
import * as matching from "./matching.js";
import * as inline from "./inline.js";
import * as pageManager from "./pageManager.js";
import pageTransitionContentScript from "./content-scripts/pageTransition.content.js";
 
permissions.check({
    module: "webScience.pageTransition",
    requiredPermissions: [ "webNavigation" ],
    suggestedOrigins: [ "<all_urls>" ]
});

/**
 * The details of a page transition data event.
 * @typedef {Object} PageTransitionDataDetails
 * @property {string} pageId - The ID for the page, unique across browsing sessions.
 * @property {string} url - The URL of the page, without any hash.
 * @property {string} referrer - The referrer URL for the page, or `""` if there is no referrer. Note that we
 * recommend against using referrers for analyzing page transitions.
 * @property {boolean} isHistoryChange - Whether the page transition was caused by a URL change via the History API.
 * @property {string} transitionType - The transition type, from `webNavigation.onCommitted`.
 * @property {string[]} transitionQualifiers - The transition qualifiers, from `webNavigation.onCommitted`.
 * @property {string} tabSourcePageId - The ID for the most recent page in the same tab. If the page is opening
 * in a new tab, then the ID of the most recent page in the opener tab. The value is `""` if there is no such page.
 * @property {string} tabSourceUrl - The URL, without any hash, for the most recent page in the same tab. If the page
 * is opening in a new tab, then the URL of the most recent page in the opener tab. The value is `""` if there is no
 * such page.
 * @property {boolean} tabSourceClick - Whether the user recently clicked or pressed enter/return on the most recent
 * page in the same tab. If the page is opening in a new tab, then whether the user  URL of the most recent page in
 * the opener tab. The value is `false` if there is no such page.
 * @property {string} timeSourcePageId - The ID for the most recent page that loaded into any tab. If this is the
 * first page visit after the extension starts, the value is "". Note that we recommend against using time-based
 * page transition data.
 * @property {string} timeSourceUrl - The URL for the most recent page that loaded into any tab. If this is the
 * first page visit after the extension starts, the value is "". Note that we recommend against using time-based
 * page transition data.
 */

/**
 * A callback function for the page transition data event.
 * @callback pageTransitionDataListener
 * @param {PageTransitionDataDetails} details - Additional information about the page transition data event.
 */

/**
 * @typedef {Object} PageTransitionDataOptions
 * @property {string[]} matchPatterns - Match patterns for pages where the listener should be notified about
 * transition data.
 * @property {boolean} [privateWindows=false] - Whether to notify the listener about page transitions in
 * private windows.
 */

/**
 * @typedef {Object} PageTransitionDataListenerRecord
 * @property {matching.MatchPatternSet} matchPatternSet - Match patterns for pages where the listener should be
 * notified about transition data.
 * @property {boolean} privateWindows - Whether to notify the listener about page transitions in
 * private windows.
 * @property {browser.contentScripts.RegisteredContentScript} contentScript - The content
 * script associated with the listener.
 */

/**
 * A map where each key is a listener function and each value is a record for that listener function.
 * @constant {Map<pageTransitionDataListener, PageTransitionDataListenerRecord>}
 * @private
 */
const pageTransitionDataListeners = new Map();

/**
 * @callback PageTransitionDataAddListener
 * @param {pageTransitionDataListener} listener - The listener to add.
 * @param {PageTransitionDataOptions} options - Options for the listener.
 */

/**
 * @callback PageTransitionDataRemoveListener
 * @param {pageTransitionDataListener} listener - The listener to remove.
 */

/**
 * @callback PageTransitionDataHasListener
 * @param {pageTransitionDataListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * @callback PageTransitionDataHasAnyListeners
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * @typedef {Object} PageTransitionDataEvent
 * @property {PageTransitionDataAddListener} addListener - Add a listener for page transition data.
 * @property {PageTransitionDataRemoveListener} removeListener - Remove a listener for page transition data.
 * @property {PageTransitionDataHasListener} hasListener - Whether a specified listener has been added.
 * @property {PageTransitionDataHasAnyListeners} hasAnyListeners - Whether the event has any listeners.
 */

/**
 * An event that fires when data about a page transition is available.
 * @constant {PageTransitionDataEvent}
 */
export const onPageTransitionData = events.createEvent({
    name: "webScience.pageTransition.onPageTransitionData",
    addListenerCallback: addListener,
    removeListenerCallback: removeListener,
    notifyListenersCallback: () => { return false; }
});

/**
 * Whether the module has been initialized.
 * @type {boolean}
 * @private
 */
let initialized = false;

/**
 * Initialize the module, registering event handlers and message schemas.
 * @private
 */
async function initialize() {
    if(initialized) {
        return;
    }
    initialized = true;

    await pageManager.initialize();

    // When pageManager.onPageVisit fires, store the page ID, URL, and start time in the time-based transition cache
    pageManager.onPageVisitStart.addListener(({ pageId, url, pageVisitStartTime, privateWindow }) => {
        // Add the page visit to the time-based cache
        pageVisitTimeCache[pageId] = { url, pageVisitStartTime, privateWindow };
        // We can't remove stale pages from the cache here, because otherwise we likely have a race condition
        // where the most recent page in the time-based transition cache (from pageManager.onPageVisitStart)
        // is the same page that's about to receive a message from the background script (because of
        // webNavigation.onDOMContentLoaded). In that situation, we might evict an older page from the cache
        // that was the correct page for time-based transition information.
    });

    // When webNavigation.onCommitted fires, store the details in the tab-based transition cache
    browser.webNavigation.onCommitted.addListener(details => {
        if(details.frameId !== 0) {
            return;
        }
        webNavigationOnCommittedCache.set(details.tabId, details);
    }, {
        url: [ { schemes: [ "http", "https" ] } ]
    });

    // When webNavigation.onDOMContentLoaded fires, pull the webNavigation.onCommitted
    // details from the cache, notify the content script, and expire stale data in the
    // time-based transition cache
    browser.webNavigation.onDOMContentLoaded.addListener(details => {
        if(details.frameId !== 0) {
            return;
        }

        // Get the cached webNavigation.onCommitted details
        const webNavigationOnCommittedDetails = webNavigationOnCommittedCache.get(details.tabId);
        if(webNavigationOnCommittedDetails === undefined) {
            return;
        }
        // Confirm that the webNavigation.onCommitted URL matches the webNavigation.onDOMContentLoaded URL
        webNavigationOnCommittedCache.delete(details.tabId);
        if(details.url !== webNavigationOnCommittedDetails.url) {
            return;
        }

        // Notify the content script with webNavigation and time-based transition data
        messaging.sendMessageToTab(details.tabId, {
            type: "webScience.pageTransition.backgroundScriptUpdate",
            url: details.url,
            DOMContentLoadedTimeStamp: details.timeStamp,
            transitionType: webNavigationOnCommittedDetails.transitionType,
            transitionQualifiers: webNavigationOnCommittedDetails.transitionQualifiers,
            pageVisitTimeCache
        });

        // Remove stale page visits from the time-based transition cache, retaining the most recent page
        // visit in any window and the most recent page visit in only non-private windows. We have to
        // track the most recent non-private page separately, since a listener might only be registered
        // for transitions involving non-private pages. We perform this expiration after sending a
        // message to the content script, for the reasons explained in the pageManager.onPageVisitStart
        // listener.
        const timeStamp = Date.now();
        const expiredCachePageIds = new Set();
        let mostRecentPageId = "";
        let mostRecentPageVisitStartTime = 0;
        let mostRecentNonPrivatePageId = "";
        let mostRecentNonPrivatePageVisitStartTime = 0;
        for(const cachePageId in pageVisitTimeCache) {
            if(pageVisitTimeCache[cachePageId].pageVisitStartTime > mostRecentPageVisitStartTime) {
                mostRecentPageId = cachePageId;
                mostRecentPageVisitStartTime = pageVisitTimeCache[cachePageId].pageVisitStartTime;
            }
            if(!pageVisitTimeCache[cachePageId].privateWindow && (pageVisitTimeCache[cachePageId].pageVisitStartTime > mostRecentNonPrivatePageVisitStartTime)) {
                mostRecentNonPrivatePageId = cachePageId;
                mostRecentNonPrivatePageVisitStartTime = pageVisitTimeCache[cachePageId].pageVisitStartTime;
            }
            if((timeStamp - pageVisitTimeCache[cachePageId].pageVisitStartTime) > pageVisitTimeCacheExpiry) {
                expiredCachePageIds.add(cachePageId);
            }
        }
        expiredCachePageIds.delete(mostRecentPageId);
        expiredCachePageIds.delete(mostRecentNonPrivatePageId);
        for(const expiredCachePageId of expiredCachePageIds) {
            delete pageVisitTimeCache[expiredCachePageId];
        }
    }, {
        url: [ { schemes: [ "http", "https" ] } ]
    });

    messaging.registerSchema("webScience.pageTransition.backgroundScriptUpdate", {
        url: "string",
        DOMContentLoadedTimeStamp: "number",
        transitionType: "string",
        transitionQualifiers: "object",
        pageVisitTimeCache: "object"
    });

    // When the content script sends data, notify the relevant listeners
    messaging.onMessage.addListener(contentScriptUpdateMessage => {
        for(const [listener, listenerRecord] of pageTransitionDataListeners) {
            if(contentScriptUpdateMessage.privateWindow && !listenerRecord.privateWindows) {
                continue;
            }
            if(listenerRecord.matchPatternSet.matches(contentScriptUpdateMessage.url)) {
                listener({
                    pageId: contentScriptUpdateMessage.pageId,
                    url: contentScriptUpdateMessage.url,
                    referrer: contentScriptUpdateMessage.referrer,
                    isHistoryChange: contentScriptUpdateMessage.isHistoryChange,
                    transitionType: contentScriptUpdateMessage.transitionType,
                    transitionQualifiers: contentScriptUpdateMessage.transitionQualifiers.slice(),
                    tabSourcePageId: contentScriptUpdateMessage.tabSourcePageId,
                    tabSourceUrl: contentScriptUpdateMessage.tabSourceUrl,
                    tabSourceClick: contentScriptUpdateMessage.tabSourceClick,
                    timeSourcePageId: listenerRecord.privateWindows ? contentScriptUpdateMessage.timeSourcePageId : contentScriptUpdateMessage.timeSourceNonPrivatePageId,
                    timeSourceUrl: listenerRecord.privateWindows ? contentScriptUpdateMessage.timeSourceUrl : contentScriptUpdateMessage.timeSourceNonPrivateUrl
                });
            }
        }
    },
    {
        type: "webScience.pageTransition.contentScriptUpdate",
        schema: {
            pageId: "string",
            url: "string",
            isHistoryChange: "boolean",
            transitionType: "string",
            transitionQualifiers: "object",
            tabSourcePageId: "string",
            tabSourceUrl: "string",
            tabSourceClick: "boolean",
            timeSourcePageId: "string",
            timeSourceUrl: "string",
            timeSourceNonPrivatePageId: "string",
            timeSourceNonPrivateUrl: "string",
            privateWindow: "boolean"
        }
    });
}

/**
 * A map where keys are tab IDs and values are the most recent `webNavigation.onCommitted`
 * details, removed from the map when a subsequent `webNavigation.onDOMContentLoaded` fires
 * for the tab.
 * @constant {Map<number, Object>}
 * @private
 */
const webNavigationOnCommittedCache = new Map();

/**
 * A map, represented as an object, where keys are page IDs and values are objects with
 * `pageVisitStartTime`, `url`, and `privateWindow` properties from `pageManager.onPageVisitStart`.
 * We use an object so that it can be easily serialized. The reason we maintain this cache
 * is to account for possible race conditions between when pages load in the content script
 * environment and when the background script environment learns about page loads.
 * @constant {Object}
 * @private
 */
const pageVisitTimeCache = { };

/**
 * The maximum time, in milliseconds, to consider a page visit as a possible most recent
 * page visit in the content script environment, even though it's not the most recent page
 * visit in the background script environment.
 */
const pageVisitTimeCacheExpiry = 1000;

/**
 * A callback function for adding a page transition data listener.
 * @param {pageTransitionDataListener} listener - The listener function being added.
 * @param {PageTransitionDataOptions} options - Options for the listener.
 * @private
 */
async function addListener(listener, {
    matchPatterns,
    privateWindows = false
}) {
    await initialize();
    // Store a record for the listener
    pageTransitionDataListeners.set(listener, {
        // Compile the listener's match pattern set
        matchPatternSet: matching.createMatchPatternSet(matchPatterns),
        privateWindows,
        // Register a content script with the listener's match patterns
        contentScript: await browser.contentScripts.register({
            matches: matchPatterns,
            js: [{
                code: inline.dataUrlToString(pageTransitionContentScript)
            }],
            runAt: "document_start"
        })
    });
}

/**
 * A callback function for removing a page transition data listener.
 * @param {pageTransitionDataListener} listener - The listener that is being removed.
 * @private
 */
function removeListener(listener) {
    const listenerRecord = pageTransitionDataListeners.get(listener);
    if(listenerRecord === undefined) {
        return;
    }
    listenerRecord.contentScript.unregister();
    pageTransitionDataListeners.delete(listenerRecord);
}
