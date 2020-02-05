/**
 * SocialMediaNewsExposure module is used to run studies that track user's exposure
 * to news content on social media websites
 * @module WebScience.Studies.SocialMediaNewsExposure
 */
import * as WebScience from "/WebScience/WebScience.js";
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Studies.SocialMediaNewsExposure");

/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;

/**
 * @name SocialMediaNewsExposure.runStudy starts the SocialMediaNewsExposure study.
 * It injects content scripts to youtube and facebook urls to track user's exposure
 * to content from known media outlets
 */
export async function runStudy({
  privateWindows = false
}) {

  // store private windows preference in the storage
  await browser.storage.local.set({ "WebScience.Studies.SocialMediaNewsExposure.privateWindows": privateWindows }); 
  storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.SocialMediaNewsExposure")).initialize();
  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextSocialMediaNewsExposureIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.SocialMediaNewsExposure.nextPageId")).initialize();

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
      matches: [ "*://*.youtube.com/*" ],
      js: [ { file: "/WebScience/Studies/content-scripts/socialMediaNewsExposure-youtube.js" } ],
      runAt: "document_idle"
  });

  // Listen for SocialMediaNewsExposure.Youtube messages from content script
  WebScience.Utilities.Messaging.registerListener("WebScience.Studies.SocialMediaNewsExposure.Youtube", (message, sender, sendResponse) => {
      // If the page content message is not from a tab, or if we are not tracking
      // the tab, ignore the message
      // Neither of these things should happen!
    debugLog("socialMediaNewsExposure.Youtube: " + JSON.stringify(message));
      if(!("tab" in sender) || !(sender.tab.id in currentTabInfo)) {
          debugLog("Warning: unexpected page content update");
          return;
      }
    storage.set("" + nextSocialMediaNewsExposureIdCounter.incrementAndGet(), message);
  }, {
    title : "string",
    url : "string"
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