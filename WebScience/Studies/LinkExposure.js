import * as WebScience from "/WebScience/WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Studies.LinkExposure");

/*  LinkExposure - This module is used to run studies that track the user's
    exposure to links. */

var storage = null;

/*  runStudy - Starts a LinkExposure study. Note that only one study is supported
    per extension. runStudy requires an options object with the following
    property.

        * domains - array of domains for tracking link exposure events */

export async function runStudy({
    domains = [ ]
}) {

    storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.LinkExposure")).initialize();

    // Use a unique identifier for each webpage the user visits
    var nextPageIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.LinkExposure.nextPageId")).initialize();

    // Add a dynamically generated content script to every HTTP/HTTPS page that
    // supports checking for whether a link's domain matches the set for the study
    // Note that we have to carefully escape the domain matching regular expression
    await browser.contentScripts.register({
        matches: [ "http://*/*", "https://*/*" ],
        js: [
            {
              code: "const urlMatchRE = \"" + 
              WebScience.Utilities.Matching.createUrlRegexString(domains).replace(/\\/g, "\\\\") + 
                "\"; const urlMatcher = new RegExp(urlMatchRE);"
            }
        ],
        runAt: "document_start"
    });

    // Add the content script for checking links on pages
    await browser.contentScripts.register({
        matches: [ "http://*/*", "https://*/*" ],
        js: [ { file: "/WebScience/Studies/content-scripts/linkExposure.js" } ],
        runAt: "document_idle"
    });

    // Listen for initial link exposure messages and save them to the database
    browser.runtime.onMessage.addListener((message, sender) => {
        if((message == null) ||
              !("type" in message) ||
              message.type != "WebScience.linkExposureInitial")
          return;

        // If the link exposure message isn't from a tab, ignore the message
        // (this shouldn't happen)
        if(!("tab" in sender))
            return;

        // TODO check whether the tab's window is the current browser window, since
        // the content script can only tell whether its tab is active within its window
        // One option: use browser.windows.getCurrent (asynchronous)
        // Another option: set a listener for browser.windows.onFocusChanged to keep track of
        //  the current window (synchronous in this context)
        // Another option: reuse the window and tab tracking from WebScience.Navigation (synchronous)

        // Save the link exposure to the database
        /* Coverted from awaits to .thens to avoid making this an async function,
         *  which was preventing other listeners from sending responses
         */
        nextPageIdCounter.getAndIncrement().then(pageId => {
            storage.set(pageId.toString(), message.content).then(() => {
              debugLog("linkExposureInitial: " + JSON.stringify(message.content));
            })
        });
    });
}

/* Utilities */

// Helper function that dumps the link exposure study data as an object
export async function getStudyDataAsObject() {
    if(storage != null)
        return await storage.getContentsAsObject();
    return null;
}
