/**
 * This module measures exposure to content labeled as news on social media platforms.
 * @module WebScience.Measurements.SocialMediaNewsExposure
 */

import * as Debugging from "../Utilities/Debugging.js"
import * as Storage from "../Utilities/Storage.js"
import * as Messaging from "../Utilities/Messaging.js"

const debugLog = Debugging.getDebuggingLog("Measurements.SocialMediaNewsExposure");

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
  await browser.storage.local.set({ "WebScience.Measurements.SocialMediaNewsExposure.privateWindows": privateWindows }); 
  storage = await (new Storage.KeyValueStorage("WebScience.Measurements.SocialMediaNewsExposure")).initialize();
  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextSocialMediaNewsExposureIdCounter = await (new Storage.Counter("WebScience.Measurements.SocialMediaNewsExposure.nextPageId")).initialize();

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
      matches: [ "*://*.youtube.com/*" ],
      js: [ { file: "/WebScience/Measurements/content-scripts/socialMediaNewsExposure-youtube.js" } ],
      runAt: "document_idle"
  });

  // Listen for SocialMediaNewsExposure.Youtube messages from content script
  Messaging.registerListener("WebScience.Measurements.SocialMediaNewsExposure.Youtube", async (message, sender, sendResponse) => {
      // If the page content message is not from a tab, or if we are not tracking
      // the tab, ignore the message
      // Neither of these things should happen!
    debugLog("socialMediaNewsExposure.Youtube: " + JSON.stringify(message));
      if(!("tab" in sender)){
          debugLog("Warning: unexpected page content update");
          return;
      }
    storage.set("" + nextSocialMediaNewsExposureIdCounter.get(), message);
    await nextSocialMediaNewsExposureIdCounter.increment();
    //storage.set("" + nextSocialMediaNewsExposureIdCounter.incrementAndGet(), message);
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
