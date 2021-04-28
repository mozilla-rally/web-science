/**
 * Content script for the pageTransition module that observes clicks on pages and notifies the
 * module's background script. We use a separate pageTransition content script for generating
 * `pageTransition.onPageTransitionData` event data, because the content scripts should run on
 * different sets of pages. We consider document `click`, `contextmenu`, and `keyup`
 * enter/return key events to be identical, since the use could open a link in any of these
 * ways. We also require that a page have the user's attention to consider a click, since
 * otherwise the click was initiated by a script.
 *
 * @module webScience.pageTransition.click.content
 */

// IIFE encapsulation to allow early return
(function () {

    // Function encapsulation to wait for pageManager load
    const pageManagerLoaded = function() {
        const pageManager = window.webScience.pageManager;

        /**
         * The time, in milliseconds, to wait between sending click events to the background script.
         * We also send clicks on page visit stop.
         * @constant {number}
         */
        const clickDebounceDelay = 200;

        /**
         * The timeout ID for debouncing click events. Set to 0 when there is no pending timeout.
         * @type {number}
         * @default
         */
        let clickDebounceTimeoutID = 0;

        /**
         * Times when the user clicked on the page. Initialized to [ ] when `onPageVisitStart` fires and
         * set to [ ] when there is no pending click to notify the background script about.
         * @type {number[]}
         * @default
         */
        let clickTimeStamps = [ ];

        /**
         * The timestamp for the last click that the content script sent to the backround script.
         * Initialized to 0 when `onPageVisitStart` fires.
         * @type {number}
         * @default
         */
        let lastSentClickTimeStamp = 0;

        /**
         * Handle document `click` and `keyup` events.
         */
        const handleClickEvent = function() {
            // If the page doesn't have the user's attention, ignore the click
            if(!pageManager.pageHasAttention) {
                return;
            }

            // Queue the click for reporting to the background script
            clickTimeStamps.push(Date.now());

            // If there's already a pending debounce timer, let it handle the click
            if(clickDebounceTimeoutID > 0) {
                return;
            }

            // If it's been longer than the debounce delay since the last click we sent,
            // send the click immediately. This is a bit different from typical debounce
            // logic (sending the initial event immediately, then waiting to debounce
            // subsequent events), but we need to immediately send clicks to handle if
            // the user has opened a link in a new tab.
            if((clickTimeStamps[clickTimeStamps.length - 1] - lastSentClickTimeStamp) > clickDebounceDelay) {
                notifyBackgroundScript();
            }

            // Otherwise, set a debounce timer to notify the background script
            else {
                clickDebounceTimeoutID = setTimeout(notifyBackgroundScript, clickDebounceDelay);
            }
        };

        /**
         * Notify the background script about the most recent click on the page.
         */
        const notifyBackgroundScript = function() {
            // If there is no pending click for notification, there's nothing to do
            if(clickTimeStamps.length === 0) {
                return;
            }
            // Clear the debounce timeout
            clearTimeout(clickDebounceTimeoutID);
            clickDebounceTimeoutID = 0;
            // Send a message to the background script
            browser.runtime.sendMessage({
                type: "webScience.pageTransition.contentScriptClickUpdate",
                pageId: pageManager.pageId,
                clickTimeStamps
            });
            // Store the timestamp for the last click we've sent
            lastSentClickTimeStamp = clickTimeStamps[clickTimeStamps.length - 1];
            // Reset the clicks to send
            clickTimeStamps = [ ];
        }

        // When the page visit start event fires, reset click tracking values
        pageManager.onPageVisitStart.addListener(() => {
            clearTimeout(clickDebounceTimeoutID);
            clickDebounceTimeoutID = 0;
            clickTimeStamps = [ ];
            lastSentClickTimeStamp = 0;
        });

        // When the page visit stop event fires, store page click data in the window
        // global for the event content script. We use this stored data if there's
        // a history API load.
        pageManager.onPageVisitStop.addListener(() => {
            if(!("webScience" in window)) {
                window.webScience = { };
            }
            if(!("pageTransition" in window.webScience)) {
                window.webScience.pageTransition = { };
            }
            window.webScience.pageTransition.lastClickPageId = pageManager.pageId;
            window.webScience.pageTransition.lastClickTimeStamp = lastSentClickTimeStamp;
        });

        // When the page visit stop event fires, send the most recent click
        // even if we haven't waited the debounce time. This is important
        // for handling a race condition in the interaction between the
        // debounce delay and how recently the user must have clicked on a
        // page to treat the click as a click transition for another page.
        pageManager.onPageVisitStop.addListener(notifyBackgroundScript);

        // Handle mouse click events. The click event captures all clicks, except those
        // that trigger the context menu (e.g., right click or control + click). We observe
        // those events with the contextmenu event.
        document.addEventListener("click", handleClickEvent);
        document.addEventListener("contextmenu", handleClickEvent);

        // Handle keyboard events.
        document.addEventListener("keyup", event => {
            if(event.code === "Enter") {
                handleClickEvent();
            }
        });
    };

    // Wait for pageManager load
    if (("webScience" in window) && ("pageManager" in window.webScience)) {
        pageManagerLoaded();
    }
    else {
        if(!("pageManagerHasLoaded" in window)) {
            window.pageManagerHasLoaded = [];
        }
        window.pageManagerHasLoaded.push(pageManagerLoaded);
    }
})();