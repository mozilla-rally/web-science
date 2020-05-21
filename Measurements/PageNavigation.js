/**
 * This module measures navigation to and attention to webpages on specific domains.
 * 
 * @module WebScience.Measurements.PageNavigation
 */

import * as Debugging from "../Utilities/Debugging.js"
import * as Storage from "../Utilities/Storage.js"
import * as Matching from "../Utilities/Matching.js"
import * as PageEvents from "../Utilities/PageEvents.js"
import * as Messaging from "../Utilities/Messaging.js"
import * as PageClassification from "./PageClassification.js"
// imports classifier weights
import covid from "./weights/covid-linearsvc_data.js";

const debugLog = Debugging.getDebuggingLog("Measurements.PageNavigation");

/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;
var currentTabInfo = null;
var urlMatcher = null;

/**
 * Callback function for classification result
 * @param {Object} result result object
 */
function classificationResults(result) {
    debugLog(JSON.stringify(result));
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

    await PageClassification.registerPageClassifier(["*://*/*"], "/WebScience/Measurements/CovidClassifier.js", covid,"covid page classifier", classificationResults);

    // Listen for metadata of the visited pages from content script
    // Use a unique identifier for each webpage the user visits that has a matching domain
    var nextPageIdCounter = await (new Storage.Counter("WebScience.Measurements.PageNavigation.nextPageId")).initialize();

    // Keep track of information about pages with matching domains that are currently loaded into a tab
    // If a tab ID is in this object, the page currently contained in that tab has a matching domain
    // Note that this is currently implemented with an object, we might want to switch it to a Map
    currentTabInfo = {}

    // listen metadata messages from content scripts
    // Handle when a page visit starts
    async function pageVisitStartListener({ url, referrer, tabId, timeStamp }) {

        // If the URL does not match the study domains, ignore the page visit start
        if (!urlMatcher.testUrl(url))
            return;

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
            referrer,
            visitStart: timeStamp,
            visitEnd: -1,
            attentionDuration: 0,
            attentionSpanCount: 0,
            attentionSpanStarts: [ ],
            attentionSpanEnds: [ ]
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

/**
 * Search the current page visits being tracked as well as the stored database for
 * a visit to a particular page.
 * @param {string} url - the page to search for, ignoring everything except host and path
 * @returns {Object} - object mapping pageIds to all page visits for `url`, if any exist
 */
export async function findUrlVisit(url) {
    if (!urlMatcher.testUrl(url)) { return; } // if it's not a tracked url, it definitely isn't in our database

    var matchingVisits = { };

    // Search in-memory pages
    for (let pageId in currentTabInfo){
        var pageVisit = currentTabInfo[pageId];
        if (Matching.approxMatchUrl(url, pageVisit.url)) {
            matchingVisits[pageId] = pageVisit;
        }
    }

    // Search previously-stored pages
    storage.iterate((pageVisit, pageId, iterationNumber) => {
        if (Matching.approxMatchUrl(url, pageVisit.url)) {
            matchingVisits[pageId] = pageVisit;
        }
    });
    return matchingVisits;
}