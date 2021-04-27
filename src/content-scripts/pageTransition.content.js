/**
 * Content script for the pageTransition module.
 *
 * @module webScience.pageTransition.content
 */

// IIFE encapsulation to allow early return
(function () {

    // If the pageTransition content script is already running on this page, no need for this instance
    if("webScience" in window) {
        if("pageTransitionActive" in window.webScience) {
            return;
        }
        window.webScience.pageTransitionActive = true;
    }
    else {
        window.webScience = {
            pageTransitionActive: true
        }
    }

    /**
     * The maximum difference, in milliseconds, between the background script timestamp in a normal page
     * page load (from `webNavigation.onDOMContentLoaded`) and the content script onDOMContentLoaded
     * timestamp (from the `PerformanceNavigationTiming` API). We compare these values as a heuristic
     * for matching background script events to content script events. The background script and content
     * script environments separately apply their own timestamps, so these values can differ more than
     * one might expect (sometimes by over 100 ms).
     * @constant
     */
    const maxDOMContentLoadedTimeStampDifference = 200;

    /**
     * The maximum difference, in milliseconds, between the background script timestamp in a history API
     * page load (from `webNavigation.onHistoryStateUpdated`) and the content script page visit start
     * timestamp (also from `webNavigation.onHistoryStateUpdated`). We compare this values as a heuristic
     * for matching background script events to content script events. While the underlying values are
     * identical, rounding the values when converting them to numbers can lead to off-by-one differences.
     * @constant
     */
    const maxHistoryStateUpdatedTimeStampDifference = 1;

    // Function encapsulation to wait for pageManager load
    const pageTransition = function() {
        const pageManager = window.webScience.pageManager;

        // Maintain a cache of the last history API change message, because it might
        // arrive before onPageVisitStart fires (i.e., the pageManager background
        // script message triggered by `webNavigation.onHistoryStateUpdated` might
        // arrive just after the pageTransition background script message triggered
        // by the same event).
        let lastHistoryChangeMessage = null;

        // Handle background script update messages
        browser.runtime.onMessage.addListener(message => {
            if(message.type !== "webScience.pageTransition.backgroundScriptUpdate") {
                return;
            }
            const handledUpdate = handleBackgroundScriptUpdate(message);
            // If there's a history API change message and it didn't match the current page,
            // that might mean the message arrived before onPageVisitStart fired. We cache
            // the message and check it again when onPageVisitStart fires.
            if(message.isHistoryChange) {
                if(!handledUpdate) {
                    lastHistoryChangeMessage = message;
                }
                else {
                    lastHistoryChangeMessage = null;
                }
            }
        });

        // Handle onPageVisitStart events by trying to generate page transition data with
        // the cached history API change message, if there is one
        pageManager.onPageVisitStart.addListener(() => {
            if(lastHistoryChangeMessage === null) {
                return;
            }
            const handledUpdate = handleBackgroundScriptUpdate(lastHistoryChangeMessage);
            if(handledUpdate) {
                lastHistoryChangeMessage = null;
            }
        });

        // Handle onPageVisitStop events by storing the page ID and URL, because this
        // might be a history API change and we'll need them for tab-based transition
        // data
        let lastPageId = "";
        let lastPageUrl = "";
        pageManager.onPageVisitStop.addListener(details => {
            lastPageId = pageManager.pageId;
            lastPageUrl = pageManager.url;
        });

        /**
         * Handle a background script update message.
         * @param {Object} message - The message from the background script.
         * @param {string} message.url - The URL for the page.
         * @param {number} message.timeStamp - The timestamp for the page that is loading,
         * either from `webNavigation.onDOMContentLoaded` or `webNavigation.onHistoryStateUpdated`.
         * @param {string} message.transitionType - The transition type for the page that is loading,
         * `webNavigation.onDOMContentLoaded` or `webNavigation.onHistoryStateUpdated`.
         * @param {string[]} message.transitionQualifiers - The transition qualifiers for the page
         * that is loading, either from `webNavigation.onDOMContentLoaded` or
         * `webNavigation.onHistoryStateUpdated`.
         * @param {boolean} message.isHistoryChange - Whether the update was caused by
         * `webNavigation.onDOMContentLoaded` (`false`) or `webNavigation.onHistoryStateUpdated`
         * (`true`).
         * @param {Object} message.pageVisitTimeCache - A map, represented as an object, where keys
         * are page IDs and values are objects with `pageVisitStartTime`, `url`, and `privateWindow`
         * properties from `pageManager.onPageVisitStart`.
         * @param {Object} message.cachedPageVisitsForTab - A map, represented as an object, where keys
         * are page IDs and values are objects with `pageVisitStartTime` and `url` properties from
         * `pageManager.onPageVisitStart`. These are cached page visits from the same tab as this page
         * or, if the page is opened in a new tab, cached page visits from the opener tab.
         * @param {boolean} message.isOpenedTab - Whether the page is loading in a new tab that was
         * opened by another tab.
         * @param {number} message.tabOpeningTimeStamp - The timestamp of when this page's tab was
         * opened, if the page is loading in a new tab that was opened by another tab. Otherwise 0.
         * @returns {boolean} Whether the background script update message was successfully used to
         * generate a PageTransitionData event message back to the background script.
         */
        const handleBackgroundScriptUpdate = function({
            url,
            timeStamp,
            transitionType,
            transitionQualifiers,
            isHistoryChange,
            pageVisitTimeCache,
            cachedPageVisitsForTab,
            isOpenedTab,
            tabOpeningTimeStamp
        }) {
            // If no page visit has started, this must be a background script update
            // for a previous page in the tab... nothing we can do in the content
            // script environment about that race condition, so ignore the message.
            if(!pageManager.pageVisitStarted) {
                return false;
            }

            // Step 1: Check URL, timestamp, and history API values from the background script
            // against the content script. This check ensures we're matching a background
            // script webNavigation event with the right content script page visit.

            // Check that the URL in the background script message matches the page URL,
            // removing any hash from the message URL for comparison to pageManager.url
            const messageUrlObj = new URL(url);
            messageUrlObj.hash = "";
            const messageUrl = messageUrlObj.href;
            if(messageUrl !== pageManager.url) {
                return false;
            }

            // Check that the timestamp for the message matches the timestamp for the page.
            // If this is a normal page load, we allow some difference in the timestamps
            // because Firefox and Chrome generate a timestamp for `webNavigation.onDOMContentLoaded`
            // separate from the content event timestamp.
            if(!isHistoryChange) {
                const performanceNavigationTimingEntries = window.performance.getEntriesByType("navigation");
                if((performanceNavigationTimingEntries.length === 0) || !("domContentLoadedEventStart" in performanceNavigationTimingEntries[0])) {
                    return false;
                }
                const DOMContentLoadedTimeStamp = window.performance.timeOrigin + performanceNavigationTimingEntries[0].domContentLoadedEventStart;
                if(Math.abs(DOMContentLoadedTimeStamp - timeStamp) > maxDOMContentLoadedTimeStampDifference) {
                    return false;
                }
            }
            // If this is a history API page load, we require a near-exact timestamp match because the 
            // timestamp in `pageManager.onPageVisitStart` is copied from ``webNavigation.onHistoryStateUpdated`.
            // We also require that the page load was via the history API.
            else if((Math.abs(pageManager.pageVisitStartTime - timeStamp) > maxHistoryStateUpdatedTimeStampDifference) || 
                    !pageManager.isHistoryChange) {
                return false;
            }

            // Step 2: Populate time-based transition data, using the page visit cache from the background
            // script. We need to separately report data for all windows and only non-private windows,
            // since a background script listener might only be listening for non-private windows.

            // Identify the most recent page visits for time-based transition data, considering either
            // all page visits or only non-private page visits
            let timeSourcePageId = "";
            let timeSourceUrl = "";
            let mostRecentPageVisitStartTime = 0;
            let timeSourceNonPrivatePageId = "";
            let timeSourceNonPrivateUrl = "";
            let mostRecentNonPrivatePageVisitStartTime = 0;
            // Remove this page from the cache of possible time-based prior pages
            if(pageManager.pageId in pageVisitTimeCache) {
                delete pageVisitTimeCache[pageManager.pageId];
            }
            for(const cachePageId in pageVisitTimeCache) {
                // Ignore pages that started after this page
                if(pageVisitTimeCache[cachePageId].pageVisitStartTime > pageManager.pageVisitStartTime) {
                    continue;
                }
                if(pageVisitTimeCache[cachePageId].pageVisitStartTime > mostRecentPageVisitStartTime) {
                    timeSourcePageId = cachePageId;
                    timeSourceUrl = pageVisitTimeCache[cachePageId].url;
                    mostRecentPageVisitStartTime = pageVisitTimeCache[cachePageId].pageVisitStartTime;
                }
                if(!pageVisitTimeCache[cachePageId].privateWindow &&
                    (pageVisitTimeCache[cachePageId].pageVisitStartTime > mostRecentNonPrivatePageVisitStartTime)) {
                    timeSourceNonPrivatePageId = cachePageId;
                    timeSourceNonPrivateUrl = pageVisitTimeCache[cachePageId].url;
                    mostRecentNonPrivatePageVisitStartTime = pageVisitTimeCache[cachePageId].pageVisitStartTime;
                }
            }

            // Step 3: Populate tab-based transition data.

            let tabSourcePageId = "";
            let tabSourceUrl = "";
            let mostRecentPageVisitStartTimeInTab = 0;

            // If this is a page load via the history API, we already have the prior page ID and URL cached.
            if(isHistoryChange) {
                tabSourcePageId = lastPageId;
                tabSourceUrl = lastPageUrl;
            }
            // If this is an ordinary page load, use the page visit tab cache in the background script page message
            // to identify the most recent page visit for time-based transition data.
            else {
                // Remove this page from the cache of possible tab-based prior pages
                if(pageManager.pageId in cachedPageVisitsForTab) {
                    delete cachedPageVisitsForTab[pageManager.pageId];
                }
                // If this is a page in a new tab opened by another tab, we should select the most recent page
                // based on when the tab was opened rather then the page visit start time. Otherwise we could
                // have a race condition where tab 1 opens tab 2, the page in tab 2 is slow to load, tab 1
                // navigates to another page, then we incorrectly associate the new page in tab 2 with the later
                // page in tab 1.
                const pageVisitComparisonTime = isOpenedTab ? tabOpeningTimeStamp : pageManager.pageVisitStartTime;
                for(const cachePageId in cachedPageVisitsForTab) {
                    // Ignore pages that started after this page started or, if this is a tab newly opened by 
                    // another tab, ignore pages that started after this tab was opened
                    if(cachedPageVisitsForTab[cachePageId].pageVisitStartTime > pageVisitComparisonTime) {
                        continue;
                    }
                    if(cachedPageVisitsForTab[cachePageId].pageVisitStartTime > mostRecentPageVisitStartTimeInTab) {
                        tabSourcePageId = cachePageId;
                        tabSourceUrl = cachedPageVisitsForTab[cachePageId].url;
                        mostRecentPageVisitStartTimeInTab = cachedPageVisitsForTab[cachePageId].pageVisitStartTime;
                    }
                }
            }

            // TODO: add support for click data
            // TODO: confirm that immediate HTML and JS redirects work as expected

            // Send the completed PageTransitionData event to the background script
            browser.runtime.sendMessage({
                type: "webScience.pageTransition.contentScriptUpdate",
                pageId: pageManager.pageId,
                url: pageManager.url,
                isHistoryChange,
                isOpenedTab,
                transitionType: transitionType,
                transitionQualifiers: transitionQualifiers,
                tabSourcePageId,
                tabSourceUrl,
                tabSourceClick: false,
                timeSourcePageId,
                timeSourceUrl,
                timeSourceNonPrivatePageId,
                timeSourceNonPrivateUrl,
                privateWindow: browser.extension.inIncognitoContext
            });
            return true;
        };
    };

    // Wait for pageManager load
    if (("webScience" in window) && ("pageManager" in window.webScience)) {
        pageTransition();
    }
    else {
        if(!("pageManagerHasLoaded" in window)) {
            window.pageManagerHasLoaded = [];
        }
        window.pageManagerHasLoaded.push(pageTransition);
    }
})();