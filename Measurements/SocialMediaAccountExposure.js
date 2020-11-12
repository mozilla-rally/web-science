/**
 * This module measures exposure to content from specific social media accounts.
 * @module WebScience.Measurements.SocialMediaAccountExposure
 */

import * as Debugging from "../Utilities/Debugging.js"
import * as Storage from "../Utilities/Storage.js"
import * as Matching from "../Utilities/Matching.js"
import * as Messaging from "../Utilities/Messaging.js"

 const debugLog = Debugging.getDebuggingLog("Measurements.SocialMediaAccountExposure");

/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;

/**
 * @name SocialMediaAccountExposure.runStudy starts the SocialMediaAccountExposure study.
 * It injects content scripts to youtube and facebook urls to track user's exposure
 * to content from known media outlets
 * 
 * @param {Array} fbaccounts - Array of facebook accounts to track 
 * @param {Array} ytchannels - Array of youtube channels to track
 */
export async function runStudy({
  fbaccounts = [ ],
  ytchannels = [ ],
  twitterHandles = [ ],
  privateWindows = false,
}) {

  // store private windows preference in the storage
  await browser.storage.local.set({ "WebScience.Measurements.SocialMediaAccountExposure.privateWindows": privateWindows }); 
  storage = await (new Storage.KeyValueStorage("WebScience.Measurements.SocialMediaAccountExposure")).initialize();
  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextSocialMediaAccountExposureIdCounter = await (new Storage.Counter("WebScience.Measurements.SocialMediaAccountExposure.nextPageId")).initialize();

  // create regex strings for media channels
  let mediaYoutubeChannelsPattern = Matching.createUrlRegexString(ytchannels);
  const knownMediaChannelMatcher = new RegExp(mediaYoutubeChannelsPattern);
  await browser.storage.local.set({knownMediaChannelMatcher : knownMediaChannelMatcher});

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
      matches: [ "*://*.youtube.com/*" ],
      js: [ { file: "/WebScience/Measurements/content-scripts/socialMediaAccountExposure-youtube.js" } ],
      runAt: "document_idle"
  });

  // create regex strings for media facebook accounts
  let mediaFacebookAccountsPattern = Matching.createUrlRegexString(fbaccounts);
  const knownFacebookAccountsMatcher = new RegExp(mediaFacebookAccountsPattern);
  await browser.storage.local.set({knownFacebookAccountsMatcher : knownFacebookAccountsMatcher});

  await browser.contentScripts.register({
    matches: ["*://*.facebook.com/*"],
    js: [
      {
        file: "/WebScience/Measurements/content-scripts/socialMediaAccountExposure-fb.js"
      }
    ],
    runAt: "document_idle"
  });

  // create regex strings for media twitter handles
  let mediaTwitterHandlesPattern = Matching.createUrlRegexString(twitterHandles);
  const knownTwitterHandleMatcher = new RegExp(mediaTwitterHandlesPattern);
  await browser.storage.local.set({knownTwitterHandleMatcher : knownTwitterHandleMatcher});

  await browser.contentScripts.register({
    matches: ["*://*.twitter.com/*"],
    js: [
      {
        file: "/WebScience/Measurements/content-scripts/socialMediaAccountExposure-twitter.js"
      }
    ],
    runAt: "document_idle"
  });

  // Listen for SocialMediaAccountExposure messages from content scripts
  Messaging.registerListener("WebScience.Measurements.SocialMediaAccountExposure", async (message, sender, sendResponse) => {
      // If the page content message is not from a tab, or if we are not tracking
      // the tab, ignore the message
      // Neither of these things should happen!
    debugLog("socialMediaAccountExposure: " + JSON.stringify(message));
      if(!("tab" in sender)){
          debugLog("Warning: unexpected social media account exposure update");
          return;
      }
    //storage.set("" + nextSocialMediaAccountExposureIdCounter.incrementAndGet(), message);
    var currentId = nextSocialMediaAccountExposureIdCounter.get();
    storage.set("" + currentId, message);
    debugLog("current id :" + currentId);
    await nextSocialMediaAccountExposureIdCounter.increment();
  }, {
    posts : "object",
    platform: "string"
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
