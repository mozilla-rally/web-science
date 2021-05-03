/**
 * Content script for the `linkResolution` module that parses links from Google News pages.
 * This parsing is fragile and, by design, degrades gracefully to resolving links with
 * HTTP requests.
 * @module webScience.linkResolution.googleNews.content
 */

import { Base64 } from "js-base64";

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
        // Iterate through all the anchor elements in the document. We don't specify Google News
        // article URLs in the CSS selector because the anchor element href could be relative
        // (with various formats) or absolute.
        const anchorElements = document.querySelectorAll("a[href]");
        for(const anchorElement of anchorElements) {
            try {
                // Ignore links that we've already checked
                if(checkedAnchorElements.has(anchorElement)) {
                    continue;
                }

                // If this is a Google News article link, try to parse a URL mapping
                const urlObj = new URL(anchorElement.href, window.location.href);
                if((urlObj.hostname === "news.google.com") && urlObj.pathname.startsWith("/articles/")) {
                    const destinationUrl = parseDestinationUrl(anchorElement);
                    if(destinationUrl !== null) {
                        // If we were able to parse a URL mapping, ignore the anchor element in future.
                        // Since Google can dynamically add jslog attributes, we might need to check an
                        // element multiple times.
                        checkedAnchorElements.add(anchorElement);
                        urlMappings.push({
                            sourceUrl: urlObj.href,
                            destinationUrl,
                            ignoreSourceUrlParameters: true
                        });
                    }
                }
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

    /**
     * Attempt to parse the destination URL from an anchor element where the href
     * is a Google News article link. This function relies on the `jslog` attribute
     * of the anchor element or a parent article tag.
     * @param {HTMLAnchorElement} anchorElement - The anchor element.
     * @returns {string|null} The parsed destination URL, or null if parsing was not
     * successful.
     */
    function parseDestinationUrl(anchorElement) {
        const elements = new Set([ anchorElement ]);
        // Consider the parent element if it's an article tag, since previously
        // jslog was set on that element instead of the anchor element
        if(anchorElement.parentElement.tagName === "ARTICLE") {
            elements.add(anchorElement.parentElement);
        }
        for(const element of elements) {
            // The destination URL is typically available in a jslog attribute,
            // which is a list of properties separated by "; ". When the URL has
            // a "2:" prepended, it's just the raw URL. When the URL has a "5:"
            // prepended, it's an array encoded with Base64 where one entry is
            // the URL. The URL can have unicode characters encoded.
            const jsLogAttributeValue = element.getAttribute("jslog");
            if(jsLogAttributeValue === null) {
                continue;
            }
            const jsLogTokens = jsLogAttributeValue.split("; ");
            for (const jsLogToken of jsLogTokens) {
                if(jsLogToken.startsWith("2:")) {
                    try {
                        const urlObj = new URL(decodeURIComponent(jsLogToken.substring(2)));
                        return urlObj.href;
                    }
                    catch {
                        continue;
                    }
                }
                else if(jsLogToken.startsWith("5:")) {
                    try {
                        // We have to use a third-party Base64 decoder rather than the built-in
                        // atob function because the string might include encoded Unicode
                        // characters, which cause an error in atob.
                        const decodedJsLog = Base64.decode(jsLogToken.substring(2));
                        // Quotation marks might be escaped with a \ in the URL, so unescape them.
                        const unescapedDecodedJsLog = decodedJsLog.replaceAll(`\\"`, `"`);
                        const values = JSON.parse(`{ "values": ${unescapedDecodedJsLog} }`).values;
                        if(!Array.isArray(values)) {
                            continue;
                        }
                        for(const value of values) {
                            if(typeof value === "string") {
                                const urlObj = new URL(decodeURIComponent(value));
                                return urlObj.href;
                            }
                        }
                    }
                    catch {
                        continue;
                    }
                }
            }
        }
        return null;
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
