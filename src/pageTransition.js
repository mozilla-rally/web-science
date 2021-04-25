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
 *     stages in the webpage loading lifecycle. Unlike `webRequest` events,
 *     `webNavigation` events are not associated with unique identifiers. We
 *     accomplish this syncing by assuming that when the
 *     `webNavigation.onDOMContentLoaded` event fires for a tab, it is part of
 *     the same navigation lifecycle as the most recent
 *     `webNavigation.onCommitted` event in the tab.
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
 */

/**
 * A map where each key is a listener function and each value is a record for that listener function.
 * @constant {Map<pageTransitionDataListener, PageTransitionDataListenerRecord>}
 * @private
 */
//const pageTransitionDataListeners = new Map();

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
 * A callback function for adding a page transition data listener.
 * @param {pageTransitionDataListener} listener - The listener function being added.
 * @param {PageTransitionDataOptions} options - Options for the listener.
 * @private
 */
async function addListener(listener, {
    matchPatterns,
    privateWindows = false
}) {
}

/**
 * A callback function for removing a page transition data listener.
 * @param {pageTransitionDataListener} listener - The listener that is being removed.
 * @private
 */
function removeListener(listener) {
}
