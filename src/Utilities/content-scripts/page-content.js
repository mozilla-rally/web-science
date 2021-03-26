/**
 * Content script to extract url, title, and text from a page
 * @module WebScience.Measurements.content-scripts.page-content
 */
// Function encapsulation to maintain unique variable scope for each content script

// Readbility and PageManager are defined by other content scripts, tell eslint not to worry
/* global Readability */
/* global PageManager */

(
    async function () {
        /**
         * Send page content to a background script (e.g., a classifier)
         * @param {string} workerId - id of the background worker
         * @param {Object} pageContent - parsed page content
         * @returns {void}
         */
        function sendPageContentToBackground(pageContent) {
            browser.runtime.sendMessage({
                type: "WebScience.Utilities.PageClassification.pageContent",
                url : document.location.href,
                pageId: PageManager.pageId,
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

        // Wait for PageManager load
        if ("PageManager" in window)
            sendPageContentToBackground(pageContent);
        else {
            if(!("pageManagerHasLoaded" in window))
                window.pageManagerHasLoaded = [];
            window.pageManagerHasLoaded.push(sendPageContentToBackground.bind(null, pageContent));
        }
    }
)();
