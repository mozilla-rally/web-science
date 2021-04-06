/**
 * Content script to extract url, title, and text from a page
 * @module webScience.pageContent.content
 */

import Readability from "@mozilla/readability";

/**
 * Send page content to a background script (e.g., a classifier)
 * @param {string} workerId - id of the background worker
 * @param {Object} pageContent - parsed page content
 * @returns {void}
 */
function sendPageContentToBackground(pageContent) {
    browser.runtime.sendMessage({
        type: "webScience.pageClassification.pageContent",
        url : document.location.href,
        pageId: window.webScience.pageManager.pageId,
        title : pageContent.title,
        text : pageContent.textContent,
        context: {
            timestamp: Date.now(),
            referrer: document.referrer,
        }
    });
}

// Parse (a clone of) the document using the injected readability script
const documentClone = document.cloneNode(true);
const pageContent = new Readability(documentClone).parse();

// Wait for pageManager load
if (("webScience" in window) && ("pageManager" in window.webScience))
    sendPageContentToBackground(pageContent);
else {
    if(!("pageManagerHasLoaded" in window))
        window.pageManagerHasLoaded = [];
    window.pageManagerHasLoaded.push(sendPageContentToBackground.bind(null, pageContent));
}
