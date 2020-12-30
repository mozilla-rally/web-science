/**
 * This module measures properties of webpage navigation for specific domains.
 * 
 * @module WebScience.Measurements.PageNavigation
 */

import * as Storage from "../Utilities/Storage.js"
import * as Matching from "../Utilities/Matching.js"
import * as Messaging from "../Utilities/Messaging.js"
import * as PageManager from "../Utilities/PageManager.js"

/**
 * The storage space for page navigation measurements.
 * @type {WebScience.Utilities.Storage.KeyValueStorage|null}
 */
let storage = null;

/**
 * Start a navigation measurement. Note that only one measurement is currently supported per extension.
 * @param {Object} options - A set of options for the measurement.
 * @param {string[]} [options.domains=[]] - The domains of interest for the measurement.
 * @param {boolean} [options.privateWindows=false] - Whether to measure pages in private windows.
 */
export async function runMeasurement({
    domains = [ ],
    privateWindows = false
}) {
    await PageManager.initialize();

    storage = await (new Storage.KeyValueStorage("WebScience.Measurements.PageNavigation")).initialize();

    /**
     * A counter for page visits that are not on domains of interest.
     * @type {WebScience.Utilities.Storage.Counter}
     */
    let untrackedPageVisits = await (new Storage.Counter("WebScience.Measurements.PageNavigation.untrackedPageVisits")).initialize();

    let urlMatcher = new Matching.UrlMatcher(domains);

    await browser.contentScripts.register({
        matches: Matching.createUrlMatchPatternArray(domains, true),
        js: [{
            file: "/WebScience/Measurements/content-scripts/pageNavigation.js"
        }],
        runAt: "document_start"
    });

    // If the user completes a page visit and the page isn't on a domain of interest,
    // increment the untracked page visit counter
    PageManager.onPageVisitStop.addListener((pageVisitStopDetails) => {
        if (!urlMatcher.testUrl(pageVisitStopDetails.url))
            untrackedPageVisits.increment();
    });

    Messaging.registerListener("WebScience.Measurements.PageNavigation.PageData", (pageData) => {
        // If the page is in a private window and the module should not measure private windows,
        // ignore the page
        if(!privateWindows && pageData.privateWindow)
            return;
        
        storage.set(pageData.pageId, pageData);
    }, {
        pageId: "string",
        url: "string",
        referrer: "string",
        pageVisitStartTime: "number",
        pageVisitStopTime: "number",
        attentionDuration: "number",
        audioDuration: "number",
        attentionAndAudioDuration: "number",
        maxRelativeScrollDepth: "number",
        privateWindow: "boolean"
    });
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
