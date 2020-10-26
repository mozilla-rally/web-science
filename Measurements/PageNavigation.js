/**
 * This module measures navigation to and attention to webpages on specific domains.
 * 
 * @module WebScience.Measurements.PageNavigation
 */

import * as Debugging from "../Utilities/Debugging.js"
import * as Storage from "../Utilities/Storage.js"
import * as Matching from "../Utilities/Matching.js"
import * as PageEvents from "../Utilities/PageEvents.js"
import * as PageClassification from "./PageClassification.js"
import * as LinkExposure from "./LinkExposure.js"
import * as PageDepth from "./PageDepth.js"

// import classifier weights
// import covidClassifierData from "./weights/covid-linearsvc_data.js";
import polClassifierData from "./weights/pol-linearsvc_data.js";


const debugLog = Debugging.getDebuggingLog("Measurements.PageNavigation");

/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;
var currentTabInfo = null;
var urlMatcher = null;
var initialized = false;

var untrackedPageVisits = null;
/**
 * Callback function for classification result
 * @param {Object} result result object
 */
async function classificationResults(result) {
    if (currentTabInfo[result.tabID] && currentTabInfo[result.tabID].url == result.url) {
        currentTabInfo[result.tabID].classification = result.predicted_class;
    }
}

async function depthResults(result) {
    if (currentTabInfo[result.tabId] && currentTabInfo[result.tabId].url == result.url) {
        currentTabInfo[result.tabId].scrollDepth = result.maxRelativeScrollDepth;
    }
    else {
        if (!urlMatcher.testUrl(result.url)) { return; }
        await storage.startsWith(result.url).then((prevVisits) => {
            for (var key in prevVisits) {
                if (prevVisits[key].tabId == result.tabId) {
                    prevVisits[key].scrollDepth = result.maxRelativeScrollDepth;
                    storage.set(key, prevVisits[key]);
                    return;
                }
            }
        });
    }

}

/**
 * Start a navigation study. Note that only one study is supported per extension.
 * @param {Object} options - A set of options for the study.
 * @param {string[]} [options.domains=[]] - The domains of interest for the study.
 * @param {boolean} [options.trackUserAttention=false] - Whether to track user
 * attention during the study.
 * @param {boolean} [options.privateWindows=false] - Whether to measure pages in
 * private windows.
 */
export async function runStudy({
    domains = [ ],
    trackUserAttention = false,
    privateWindows = false
}) {

    storage = await (new Storage.KeyValueStorage("WebScience.Measurements.PageNavigation")).initialize();

    urlMatcher = new Matching.UrlMatcher(domains);

    untrackedPageVisits = await (new Storage.Counter("WebScience.Measurements.PageNavigation.untrackedPageVisits")).initialize();

    await PageClassification.registerPageClassifier(["*://*/*"], "/WebScience/Measurements/PolClassifier.js", polClassifierData,"pol-page-classifier", classificationResults);
    //await PageClassification.registerPageClassifier(["*://*/*"], "/WebScience/Measurements/CovidClassifier.js", covidClassifierData,"covid-page-classifier", classificationResults);

    PageDepth.registerListener(depthResults);

    // Listen for metadata of the visited pages from content script
    // Use a unique identifier for each webpage the user visits that has a matching domain
    var nextPageIdCounter = await (new Storage.Counter("WebScience.Measurements.PageNavigation.nextPageId")).initialize();

    // Keep track of information about pages with matching domains that are currently loaded into a tab
    // If a tab ID is in this object, the page currently contained in that tab has a matching domain
    // Note that this is currently implemented with an object, we might want to switch it to a Map
    currentTabInfo = {}
    initialized = true;

    // listen metadata messages from content scripts
    // Handle when a page visit starts
    async function pageVisitStartListener({ url, referrer, tabId, timeStamp }) {

        // If the URL does not match the study domains, ignore the page visit start
        if (!urlMatcher.testUrl(url)) {
            untrackedPageVisits.incrementAndGet();
            return;
        }
        url = Storage.normalizeUrl(url);

        // If we are already tracking a page in this tab, ignore the page visit start
        // This shouldn't happen!
        if (tabId in currentTabInfo) {
            debugLog("Warning: page start event for tab that already has a page");
            return;
        }


        // Otherwise, remember the page visit start and increment the page counter
        currentTabInfo[tabId] = {
            pageId: nextPageIdCounter.get(),
            url,
            tabId,
            referrer,
            visitStart: timeStamp,
            visitEnd: -1,
            attentionDuration: 0,
            attentionSpanCount: 0,
            attentionSpanStarts: [ ],
            attentionSpanEnds: [ ],
            classification: -1,
            scrollDepth: -1,
            prevExposed: false, // will check after storing this
            laterShared: false
        };
        var prevExposed = await LinkExposure.logVisit(url);
        currentTabInfo[tabId].prevExposed = prevExposed;
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
        tabInfoToSave.type = "pageVisit";

        debugLog("pageVisitStopListener: " + JSON.stringify(tabInfoToSave));

        // Store the final set of information for the page
        storage.set(tabInfoToSave.url + " " + tabInfoToSave.pageId.toString(), tabInfoToSave);
    };

    var inAttentionSpan = false;
    var startOfCurrentAttentionSpan = -1;

    // Handle when a page attention span starts
    function pageAttentionStartListener({tabId, timeStamp}) {
        // If we have not remembered the page receiving attention, the page does not have a matching
        // domain, so ignore the page attention start event
        if(!(tabId in currentTabInfo)) {
            return;
        }

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
    PageEvents.registerPageVisitStartListener(pageVisitStartListener, true, privateWindows, timeStamp);
    PageEvents.registerPageVisitStopListener(pageVisitStopListener, privateWindows);
    if(trackUserAttention) {
        PageEvents.registerPageAttentionStartListener(pageAttentionStartListener, true, privateWindows, timeStamp);
        PageEvents.registerPageAttentionStopListener(pageAttentionStopListener, privateWindows);
    }

    // Build the URL matching set for content scripts
    var contentScriptMatches = Matching.createUrlMatchPatternArray(domains, true);

    // Store whether the Navigation study is running in private windows in extension
    // local storage, so that it is available to content scripts
    await browser.storage.local.set({ "WebScience.Measurements.PageNavigation.privateWindows": privateWindows });
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

export async function storeAndResetUntrackedVisitsCount() {
    if (initialized) {
        await storage.set("WebScience.Measurements.PageNavigation.untrackedVisitCount", 
            {type: "untrackedVisitCount",
             numUntrackedVisits: await untrackedPageVisits.getAndReset()
            });
    }
}

export async function logShare(url) {
    if (!urlMatcher.testUrl(url)) { return; } // if it's not a tracked url, it definitely isn't in our database

    var prevVisitReferrer = null;

    // Search in-memory pages
    for (let pageId in currentTabInfo){
        var pageVisit = currentTabInfo[pageId];
        if (url == pageVisit.url) {
            currentTabInfo[pageId].laterShared = true;
            if (!prevVisitReferrer) prevVisitReferrer = pageVisit.referrer;
        }
    }

    // Search previously-stored pages
    var bestReferrer = {ts: 0, referrer: ""}
    await storage.startsWith(url).then((prevVisits) => {
        for (var key in prevVisits) {
            if (prevVisits[key].visitStart > bestReferrer.ts) {
                bestReferrer.ts = prevVisits[key].visitStart
                bestReferrer.referrer = prevVisits[key].referrer
            }
            prevVisits[key].laterShared = true;
            storage.set(key, prevVisits[key]);
        }
    });

    if (!prevVisitReferrer) prevVisitReferrer = bestReferrer.referrer;
    return [prevVisitReferrer];
}
