/**
 * Content script for the Fathom module. Uses Mozilla Fathom
 * to classify the DOM elements of a page.
 * @module webScience.fathom.content
 *
 * TODO: 
 * - rerun fathom on mutation observer?
 * - keep track of viewTime of classified elements using intersection observer?
 * - draw borders as an option?
 */


(function() {
    // Check if content script is already running
    if ("webScience" in window) {
        if ("fathomActive" in window.webScience) {
            return;
        }
        window.webScience.fathomActive = true;
    }
    else {
        // Else, this is the first webScience initialization
        window.webScience = {
            fathomActive: true
        }
    }

    /**
     * Whether the elements of this page have been classified.
     * @type {boolean}
     */
    let pageClassified = false;
    
    // Function to call once pageManager is loaded
    function pageManagerLoaded() {
        console.log("pageManager loaded, running fathom content script");
        const pageManager = window.webScience.pageManager;

        // Listen for messages from background script
        // Background script will tell us if this page should be classified
        // and what Fathom rulesets to use
        browser.runtime.onMessage.addListener((message) => {
            if (message.type !== "webScience.fathom.isClassifiable" ||
                !message.isClassifiable) {
                return;
            }

            if (pageClassified) {
                console.log("Page already classified, returning");
                return;
            }

            console.log("Running fathom");
            // run Fathom here
            pageClassified = true;

            // Send results to background script
            console.log("Sending fathom results");
            pageManager.sendMessage({
                type: "webScience.fathom.fathomData",
                test: "hello from content script"
            });
            console.log("Fathom results sent");
        });
    }

    // If pageManager is loaded, call our main function
    if ("webScience" in window && "pageManager" in window.webScience) {
        pageManagerLoaded();
    }
    // If pageManager is not loaded, push our main function to queue
    else {
        if (!("pageManagerHasLoaded" in window)) {
            window.pageManagerHasLoaded = [];
        }
        window.pageManagerHasLoaded.push(pageManagerLoaded());
    }

    console.log("content script initialized");
})();

