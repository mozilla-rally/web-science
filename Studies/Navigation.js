import * as WebScience from "/WebScience/WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Studies.Navigation");

/*  Navigation - This module is used to run studies that track the user's
    navigation of and attention to webpages. */

var storage = null;

/*  runStudy - Starts a Navigation study. Note that only one study is supported
    per extension. runStudy requires an options object with the following
    properties
        * domains - array of domains for tracking navigation events (default [ ])
        * trackUserAttention - whether to record user attention to webpages (default false)
        * savePageContent - whether to record page content (default false) */

export async function runStudy({
    domains = [ ],
    trackUserAttention = false,
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
    async function pageVisitStartListener(tabId, windowId, url, timeStamp) {

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
            pageId: await nextPageIdCounter.getAndIncrement(),
            url: url,
            referrer: "",
            visitStart: timeStamp,
            visitEnd: -1,
            attentionDuration: 0,
            attentionSpanCount: 0,
            attentionSpanStarts: [ ],
            attentionSpanEnds: [ ],
            pageContent: ""
        };
        debugLog("pageVisitStartListener: " + JSON.stringify(currentTabInfo[tabId]));
    };

    // Handle when a page visit stops
    async function pageVisitStopListener(tabId, windowId, timeStamp) {
        
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
    function pageAttentionStartListener(tabId, windowId, timeStamp) {
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
    function pageAttentionStopListener(tabId, windowId, timeStamp) {
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

    try {
        var timeStamp = Date.now();
        WebScience.Utilities.PageEvents.registerPageVisitStartListener(pageVisitStartListener, true, timeStamp);
        WebScience.Utilities.PageEvents.registerPageVisitStopListener(pageVisitStopListener);
        if(trackUserAttention) {
            WebScience.Utilities.PageEvents.registerPageAttentionStartListener(pageAttentionStartListener, true, timeStamp);
            WebScience.Utilities.PageEvents.registerPageAttentionStopListener(pageAttentionStopListener);
        }
    }
    catch(error) {
        console.log(error);
    }

    // Build the URL matching set for content scripts
    var contentScriptMatches = WebScience.Utilities.Matching.createUrlMatchPatternArray(domains, true);

    // Register the content script for sharing the referrer of a page with a matching domain
    await browser.contentScripts.register({
        matches: contentScriptMatches,
        js: [ { file: "/WebScience/Studies/content-scripts/referrer.js" } ],
        runAt: "document_start"
    });

    // Listen for update messages from the referrer content script
    browser.runtime.onMessage.addListener((message, sender) => {
        if((message == null) || !("type" in message) || message.type != "WebScience.referrerUpdate")
            return;

        // If the referrer message is not from a tab, or if we are not tracking
        // the tab, ignore the message
        // Neither of these things should happen!
        if(!("tab" in sender) || !(sender.tab.id in currentTabInfo)) {
            debugLog("Warning: unexpected page referrer update");
            return;
        }

        // Remember the referrer for this page
        currentTabInfo[sender.tab.id].referrer = message.content.referrer;
        debugLog("referrerUpdate: " + JSON.stringify(currentTabInfo[sender.tab.id]));
    });

    // If the study should save page content...
    if(savePageContent) {

        // Register the content script for sharing the content of a page with a matching domain
        await browser.contentScripts.register({
            matches: contentScriptMatches,
            js: [ { file: "/WebScience/Studies/content-scripts/pageContent.js" } ],
            runAt: "document_idle"
        });

        // Listen for update messages from the page content content script
        browser.runtime.onMessage.addListener((message, sender) => {
            if((message == null) ||
              !("type" in message) ||
              message.type != "WebScience.pageContentUpdate")
                return;

            // If the page content message is not from a tab, or if we are not tracking
            // the tab, ignore the message
            // Neither of these things should happen!
            if(!("tab" in sender) || !(sender.tab.id in currentTabInfo)) {
                debugLog("Warning: unexpected page content update");
                return;
            }

            // Remember the page content for this page
            currentTabInfo[sender.tab.id].pageContent = message.content.pageContent;
            debugLog("pageContentUpdate: " + JSON.stringify(currentTabInfo[sender.tab.id]));
        });
    }
}

/* Utilities */

// Helper function that dumps the navigation study data as an object
export async function getStudyDataAsObject() {
    if(storage != null)
        return await storage.getContentsAsObject();
    return null;
}
