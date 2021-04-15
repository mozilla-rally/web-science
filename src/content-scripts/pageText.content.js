/**
 * Content script for the pageText module. Uses Mozilla Readability
 * to parse text content from the page.
 * @module webScience.pageText.content
 */

// We need to use import * rather than import Readability here, because the
// @rollup/plugin-commonjs conversion from CommonJS to ES6 modules doesn't
// work on the Readability class but does work on the entire module
import * as readability from "@mozilla/readability";

// IIFE wrapper to allow early return
(function() {
    // If the pageText content script is already running on this page, no need for this instance
    if("webScience" in window) {
        if("pageTextActive" in window.webScience) {
            return;
        }
        window.webScience.pageTextActive = true;
    }
    else {
        window.webScience = {
            pageTextActive: true
        }
    }

    /**
     * Whether the page has been parsed.
     * @type {boolean}
     */
    let parsedPage = false;

    // Wait for pageManager to load
    function pageManagerLoaded() {
        const pageManager = window.webScience.pageManager;
        // Listen for the background script to message that the page can likely be parsed with Readability
        browser.runtime.onMessage.addListener((message) => {
            // If the page can likely be parsed with Readability, there's an ongoing page visit, and
            // the page hasn't been parsed, parse the page
            if((message.type === "webScience.pageText.isArticle") && 
            message.isArticle &&
            pageManager.pageVisitStarted &&
            !parsedPage) {
                try {
                    // Readability modifies the DOM, so clone the document first and then call Readability
                    const documentClone = document.cloneNode(true); 
                    const article = (new readability.Readability(documentClone)).parse();
                    // Send the text content to the background script
                    browser.runtime.sendMessage({
                        type: "webScience.pageText.parsedText",
                        pageId: pageManager.pageId,
                        url: pageManager.url,
                        title: article.title,
                        content: article.content,
                        textContent: article.textContent,
                        privateWindow: browser.extension.inIncognitoContext
                    });
                    parsedPage = true;
                }
                // Ignore errors, since when Readability isn't successful we just don't send text
                catch(error) {
                    return;
                }
            }
        });
        // When a page visit ends, reset the flag that the page has been parsed
        pageManager.onPageVisitStop.addListener(() => {
            parsedPage = false;
        });
    }
    if (("webScience" in window) && ("pageManager" in window.webScience)) {
        pageManagerLoaded();
    }
    else {
        if(!("pageManagerHasLoaded" in window))
            window.pageManagerHasLoaded = [];
        window.pageManagerHasLoaded.push(pageManagerLoaded);
    }
})();