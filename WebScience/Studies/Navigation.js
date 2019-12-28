/**
 * This module is used to run studies that track the user's navigation of
 * and attention to webpages on domains of interest.
 * 
 * @module WebScience.Studies.Navigation
 */

import * as WebScience from "../WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Studies.Navigation");

/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;

/**
 * Start a navigation study. Note that only one study is supported per extension.
 * @param {Object} options - A set of options for the study.
 * @param {string[]} [options.domains=[]] - The domains of interest for the study.
 * @param {boolean} [options.trackUserAttention=false] - Whether to track user
 * attention during the study.
 * @param {boolean} [options.privateWindows=false] - Whether to measure pages in
 * private windows.
 * @param {boolean} [options.savePageContent=false] - Whether to save webpage HTML
 * content during the study.
 */
export async function runStudy({
    domains = [ ],
    trackUserAttention = false,
    privateWindows = false,
    savePageContent = false
}) {

    storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.Navigation")).initialize();

    const urlMatcher = new WebScience.Utilities.Matching.UrlMatcher(domains);

    // Use a unique identifier for each webpage the user visits that has a matching domain
    var nextPageIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.Navigation.nextPageId")).initialize();

    // Keep track of information about pages with matching domains that are currently loaded into a tab
    // If a tab ID is in this object, the page currently contained in that tab has a matching domain
    // Note that this is currently implemented with an object, we might want to switch it to a Map
    var currentTabInfo = { }

    // Handle when a page visit starts
    async function pageVisitStartListener({url, referrer, tabId, timeStamp}) {

        // If the URL does not match the study domains, ignore the page visit start
        if(!urlMatcher.testUrl(url))
            return;
        
        // If we are already tracking a page in this tab, ignore the page visit start
        // This shouldn't happen!
        if(tabId in currentTabInfo) {
            debugLog("Warning: page start event for tab that already has a page");
            return;
        }
        
        // Otherwise, remember the page visit start and increment the page counter
        currentTabInfo[tabId] = {
            pageId: nextPageIdCounter.get(),
            url,
            referrer,
            visitStart: timeStamp,
            visitEnd: -1,
            attentionDuration: 0,
            attentionSpanCount: 0,
            attentionSpanStarts: [ ],
            attentionSpanEnds: [ ],
            pageContent: ""
        };
        debugLog("pageVisitStartListener: " + JSON.stringify(currentTabInfo[tabId]));
        await nextPageIdCounter.increment();
    };

    // Handle when a page visit stops
    async function pageVisitStopListener({tabId, timeStamp}) {
        
        // If we are not tracking a page in this tab, ignore the page visit stop
        if(!(tabId in currentTabInfo))
            return;

        // Otherwise create a copy of what we have remembered about the page visit,
        // remove the page from the current set of tracked pages, and save the copy
        // to storage
        var tabInfoToSave = Object.assign({}, currentTabInfo[tabId]);
        tabInfoToSave.visitEnd = timeStamp;
        delete currentTabInfo[tabId];

        debugLog("pageVisitStopListener: " + JSON.stringify(tabInfoToSave));

        // Store the final set of information for the page
        storage.set(tabInfoToSave.pageId.toString(), tabInfoToSave);
    };

    var inAttentionSpan = false;
    var startOfCurrentAttentionSpan = -1;

    // Handle when a page attention span starts
    function pageAttentionStartListener({tabId, timeStamp}) {
        // If we have not remembered the page receiving attention, the page does not have a matching
        // domain, so ignore the page attention start event
        if(!(tabId in currentTabInfo))
            return;

        // Remember the start of the attention span
        inAttentionSpan = true;
        startOfCurrentAttentionSpan = timeStamp;
        debugLog("pageAttentionStartListener: " + JSON.stringify(currentTabInfo[tabId]));
    };

    // Handle when a page attention span ends
    function pageAttentionStopListener({tabId, timeStamp}) {
        // If we have not remembered the page receiving attention, the page does not have a matching
        // domain, so ignore the page attention stop event
        if(!(tabId in currentTabInfo))
            return;

        // If we are not currently in an attention span, ignore the page attention stop event
        // This should not happen!
        if(!inAttentionSpan) {
            debugLog("Warning: unexpected page attention stop");
            return;
        }

        // Remember the end of the attention span
        currentTabInfo[tabId].attentionDuration = 
            currentTabInfo[tabId].attentionDuration + 
            (timeStamp - startOfCurrentAttentionSpan);
        currentTabInfo[tabId].attentionSpanCount = 
            currentTabInfo[tabId].attentionSpanCount + 1;
        currentTabInfo[tabId].attentionSpanStarts.push(startOfCurrentAttentionSpan);
        currentTabInfo[tabId].attentionSpanEnds.push(timeStamp);

        inAttentionSpan = false;
        startOfCurrentAttentionSpan = -1;
        debugLog("pageAttentionStopListener: " + JSON.stringify(currentTabInfo[tabId]));
    };

    // Register the page visit listeners and, if needed for the study, the page attention listeners
    // Use a timestamp to synchronize initial page visit and page attention times

    var timeStamp = Date.now();
    WebScience.Utilities.PageEvents.registerPageVisitStartListener(pageVisitStartListener, true, privateWindows, timeStamp);
    WebScience.Utilities.PageEvents.registerPageVisitStopListener(pageVisitStopListener, privateWindows);
    if(trackUserAttention) {
        WebScience.Utilities.PageEvents.registerPageAttentionStartListener(pageAttentionStartListener, true, privateWindows, timeStamp);
        WebScience.Utilities.PageEvents.registerPageAttentionStopListener(pageAttentionStopListener, privateWindows);
    }

    // Build the URL matching set for content scripts
    var contentScriptMatches = WebScience.Utilities.Matching.createUrlMatchPatternArray(domains, true);

    // Store whether the Navigation study is running in private windows in extension
    // local storage, so that it is available to content scripts
    await browser.storage.local.set({ "WebScience.Studies.Navigation.privateWindows": privateWindows });

    // If the study should save page content...
    if(savePageContent) {
        // Listen for update messages from the page content content script
        WebScience.Utilities.Messaging.registerListener("WebScience.Studies.Navigation.pageContentUpdate", (message, sender) => {
            // If the page content message is not from a tab, or if we are not tracking
            // the tab, ignore the message
            // Neither of these things should happen!
            if(!("tab" in sender) || !(sender.tab.id in currentTabInfo)) {
                debugLog("Warning: unexpected page content update");
                return;
            }

            // Remember the page content for this page
            currentTabInfo[sender.tab.id].pageContent = message.pageContent;
            debugLog("pageContentUpdate: " + JSON.stringify(currentTabInfo[sender.tab.id]));
        },
        { pageContent: "string" });

        // Register the content script for sharing the content of a page with a matching domain
        await browser.contentScripts.register({
            matches: contentScriptMatches,
            js: [ { file: "/WebScience/Studies/content-scripts/pageContent.js" } ],
            runAt: "document_idle"
        });
    }
}

/* Utilities */

/**
 * Retrieve the study data as an object. Note that this could be very
 * slow if there is a large volume of study data.
 * @returns {(Object|null)} - The study data, or `null` if no data
 * could be retrieved.
 */
export async function getStudyDataAsObject() {
    if(storage != null)
        return await storage.getContentsAsObject();
    return null;
}
