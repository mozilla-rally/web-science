/**
 * Content script for the `linkResolution` module that parses links from Twitter pages.
 * This parsing is fragile and, by design, degrades gracefully to resolving links with
 * HTTP requests.
 * @module linkResolution.twitter.content
 */

function pageManagerLoaded() {
    const pageManager = window.webScience.pageManager;

    /**
     * How often, in milliseconds, to tick the timer for checking links when the page has attention.
     * @constant {number}
     */
    const timerInterval = 500;

    /**
     * The anchor elements that have already been checked on the page.
     * @type {WeakSet<HTMLAnchorElement>}
     */
    let checkedAnchorElements = new WeakSet();

    /**
     * The timeout ID for timer ticks when the page has attention.
     * @type {number}
     */
    let timeoutID = -1;

    /**
     * Whether the page is currently between page visit start and
     * page visit stop events.
     */
    let inPageVisit = false;
    
    /**
     * A listener for pageManager.onPageVisitStart that resets
     * page variables and starts the timer ticking if the page
     * has attention.
     */
    function pageVisitStartListener() {
        checkedAnchorElements = new WeakSet();
        timeoutID = -1;
        inPageVisit = true;
        if(pageManager.pageHasAttention) {
            timerTick();
        }
    }
    pageManager.onPageVisitStart.addListener(pageVisitStartListener);
    if(pageManager.pageVisitStarted) {
        pageVisitStartListener();
    }

    /**
     * A listener for pageManager.onPageVisitStop that
     * clears the ticking timer.
     */
    function pageVisitStopListener() {
        clearTimeout(timeoutID);
    }
    pageManager.onPageVisitStop.addListener(pageVisitStopListener);

    /**
     * A listener for pageManager.onPageAttentionUpdate that
     * clears the ticking timer if the page loses attention
     * and starts the ticking timer if the page gains
     * attention.
     */
    function pageAttentionUpdateListener() {
        // Ignore attention events when we aren't between page visit
        // start and page visit stop events
        if(!inPageVisit) {
            return;
        }
        if(!pageManager.pageHasAttention) {
            clearTimeout(timerTick);
        }
        else {
            timerTick();
        }
    }
    pageManager.onPageAttentionUpdate.addListener(pageAttentionUpdateListener);

    /**
     * When the timer ticks, check all the anchor elements in the document that haven't already been
     * checked.
     */
    function timerTick() {
        const urlMappings = [ ];
        // Iterate through all the anchor elements in the document with an href that starts with
        // https://t.co/
        const anchorElements = document.querySelectorAll(`a[href^="https://t.co/"]`);
        for(const anchorElement of anchorElements) {
            try {
                // Ignore links that we've already checked
                if(checkedAnchorElements.has(anchorElement)) {
                    continue;
                }
                checkedAnchorElements.add(anchorElement);
                
                // If the inner text for the link parses as a valid URL, that's the destination
                // URL for the mapping
                const urlObj = new URL(anchorElement.innerText);                    
                urlMappings.push({
                    sourceUrl: anchorElement.href,
                    destinationUrl: urlObj.href,
                    ignoreSourceUrlParameters: true
                });
            }
            catch {
                continue;
            }
        }

        // Notify the background script
        if(urlMappings.length > 0) {
            browser.runtime.sendMessage({
                type: "webScience.linkResolution.registerUrlMappings",
                pageId: pageManager.pageId,
                urlMappings
            });
        }

        // If the page has attention, set another timer tick
        if(pageManager.pageHasAttention) {
            timeoutID = setTimeout(timerTick, timerInterval);
        }
    }
}

// Wait for pageManager load
if (("webScience" in window) && ("pageManager" in window.webScience)) {
    pageManagerLoaded();
}
else {
    if(!("pageManagerHasLoaded" in window))
        window.pageManagerHasLoaded = [];
    window.pageManagerHasLoaded.push(pageManagerLoaded);
}
