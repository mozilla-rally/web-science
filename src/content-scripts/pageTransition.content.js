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
     * The maximum difference, in milliseconds, between the background script onDOMContentLoaded timestamp
     * (from `webNavigation.onDOMContentLoaded`) and the content script onDOMContentLoaded timestamp (from
     * the `PerformanceNavigationTiming` API). We compare these values as a heuristic for matching
     * background script events to content script events.
     * @constant
     */
    const maxDOMContentLoadedTimeStampDifference = 200;

    // Function encapsulation to wait for pageManager load
    const pageTransition = function() {
        const pageManager = window.webScience.pageManager;
        browser.runtime.onMessage.addListener(message => {
            if(message.type !== "webScience.pageTransition.backgroundScriptUpdate") {
                return;
            }

            // TODO: handle background script messages that arrive before page visit start 
            if(!pageManager.pageVisitStarted) {
                return;
            }

            // Check that the URL in the background script message matches the page URL,
            // removing any hash from the message URL for comparison to pageManager.url
            const messageUrlObj = new URL(message.url);
            messageUrlObj.hash = "";
            const messageUrl = messageUrlObj.href;
            if(messageUrl !== pageManager.url) {
                return;
            }

            // Check that the DOMContentLoaded timestamp from the background script environment
            // is close to the DOMContentLoaded timestamp for this page
            const performanceNavigationTimingEntries = window.performance.getEntriesByType("navigation");
            if((performanceNavigationTimingEntries.length === 0) || !("domContentLoadedEventStart" in performanceNavigationTimingEntries[0])) {
                return;
            }
            const DOMContentLoadedTimeStamp = window.performance.timeOrigin + performanceNavigationTimingEntries[0].domContentLoadedEventStart;
            if(Math.abs(DOMContentLoadedTimeStamp - message.DOMContentLoadedTimeStamp) > maxDOMContentLoadedTimeStampDifference) {
                return;
            }

            // TODO: add support for tab-based transition data
            // TODO: implement support for time-based transition data
            // TODO: handle page visits via the History API
            browser.runtime.sendMessage({
                type: "webScience.pageTransition.contentScriptUpdate",
                pageId: pageManager.pageId,
                url: pageManager.url,
                isHistoryChange: false,
                transitionType: message.transitionType,
                transitionQualifiers: message.transitionQualifiers,
                tabSourcePageId: "",
                tabSourceUrl: "",
                tabSourceClick: false,
                timeSourcePageId: "",
                timeSourceUrl: ""
            });
        });
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