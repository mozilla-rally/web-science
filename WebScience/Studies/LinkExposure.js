/**
 * LinkExposure module is used to run studies that track user's exposure
 * to content from known news domains
 * @module WebScience.Studies.LinkExposure
 */
import * as WebScience from "/WebScience/WebScience.js";
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Studies.LinkExposure");

/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;

/**
 * @name LinkExposure.runStudy starts the LinkExposure study.
 * @param {String[]} domains - Array of domains to track 
 * @param {boolean} privateWindows - If true then the study works in private windows
 */
export async function runStudy({
  domains = [],
  privateWindows = false,
}) {

  // store private windows preference in the storage
  await browser.storage.local.set({ "WebScience.Studies.LinkExposure.privateWindows": privateWindows }); 
  storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.LinkExposure")).initialize();
  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextLinkExposureIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.LinkExposure.nextPageId")).initialize();
  let shortDomains = WebScience.Utilities.LinkResolution.getShortDomains();
  let domainPattern = WebScience.Utilities.Matching.createUrlRegexString(domains);
  let shortDomainPattern = WebScience.Utilities.Matching.createUrlRegexString(shortDomains);
  const shortDomainMatcher = new RegExp(shortDomainPattern);
  const urlMatcher = new RegExp(domainPattern);
  await browser.storage.local.set({domainRegex: urlMatcher, shortDomainRegex: shortDomainMatcher});

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
    matches: ["*://*/*"],
    js: [{
        file: "/WebScience/Studies/content-scripts/utils.js"
      },
      {
        file: "/WebScience/Studies/content-scripts/linkExposure.js"
      }
    ],
    runAt: "document_idle"
  });

  // Listen for LinkExposure messages from content script
  WebScience.Utilities.Messaging.registerListener("WebScience.linkExposure", (exposureInfo, sender, sendResponse) => {
    if (!("tab" in sender)) {
      debugLog("Warning: unexpected link exposure update");
      return;
    }
      exposureInfo.exposureEvents.forEach(exposureEvent => {
      exposureEvent.isShortenedUrl = shortDomainMatcher.test(exposureEvent.originalUrl);
      exposureEvent.resolutionSucceded = true;
      // resolvedUrl is valid only for urls from short domains
      exposureEvent.resolvedUrl = undefined;
      if (exposureEvent.isShortenedUrl) {
        let promise = WebScience.Utilities.LinkResolution.resolveUrl(exposureEvent.originalUrl);
        promise.then(function (result) {
          if (urlMatcher.test(result.dest)) {
            exposureEvent.resolvedUrl = result.dest;
          }
        }, function (error) {
          exposureEvent.error = error.message;
          exposureEvent.resolutionSucceded = false;
        }).finally(function () {
          if (!exposureEvent.resolutionSucceded || exposureEvent.resolvedUrl !== undefined)
            createLinkExposureRecord(exposureEvent, nextLinkExposureIdCounter);
        });
      } else {
        createLinkExposureRecord(exposureEvent, nextLinkExposureIdCounter);
      }
    });

    }, {
      type: "string",
      metadata: "object"
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

/**
 * Function tests whether a given object is empty
 * @param {Object} obj - Object to test
 * @returns {boolean} - true if the object is empty
 * @private
 */
function isEmpty(obj) {
  return !obj || Object.keys(obj).length === 0;
}

/**
 * 
 * @param {LinkExposureEvent} exposureEvent link exposure event to store
 * @param {string} LinkExposureEvent.originalUrl - link exposed to
 * @param {string} LinkExposureEvent.resolvedUrl - optional field which is set if the isShortenedUrl and resolutionSucceeded are true
 * @param {boolean} LinkExposureEvent.resolutionSucceded - true if link resolution succeeded
 * @param {boolean} LinkExposureEvent.isShortenedUrl - true if link matches short domains
 * @param {number} LinkExposureEvent.firstSeen - timestamp when the link is first seen
 * @param {number} LinkExposureEvent.duration - milliseconds of link exposure
 * @param {Object} LinkExposureEvent.size - width and height of links
 * @param {Counter} nextLinkExposureIdCounter counter object
 */
function createLinkExposureRecord(exposureEvent, nextLinkExposureIdCounter) {
  debugLog("storing " + JSON.stringify(exposureEvent));
  storage.set("" + nextLinkExposureIdCounter.incrementAndGet(), exposureEvent);
}