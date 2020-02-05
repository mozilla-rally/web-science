/**
 * SocialMediaAccountExposure module is used to run studies that track user's exposure
 * to content from known media channels (facebook posts from official page, videos posted on channels etc)
 * @module WebScience.Studies.SocialMediaAccountExposure
 */
import * as WebScience from "/WebScience/WebScience.js";
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Studies.SocialMediaAccountExposure");

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
  privateWindows = false,
}) {

  // store private windows preference in the storage
  await browser.storage.local.set({ "WebScience.Studies.SocialMediaAccountExposure.privateWindows": privateWindows }); 
  storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.SocialMediaAccountExposure")).initialize();
  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextSocialMediaAccountExposureIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.SocialMediaAccountExposure.nextPageId")).initialize();

  // create regex strings for media channels
  let mediaYoutubeChannels = WebScience.Utilities.Matching.createUrlRegexString(ytchannels);
  await browser.storage.local.set({mediaYoutubeChannelsRegexString : mediaYoutubeChannels});

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
      matches: [ "*://*.youtube.com/*" ],
      js: [ { file: "/WebScience/Studies/content-scripts/socialMediaAccountExposure-youtube.js" } ],
      runAt: "document_idle"
  });

  // create regex strings for media accounts
  let mediaFacebookAccounts = WebScience.Utilities.Matching.createUrlRegexString(fbaccounts);
  await browser.storage.local.set({mediaFacebookAccountsRegexString : mediaFacebookAccounts});

  await browser.contentScripts.register({
    matches: ["*://*.facebook.com/*"],
    js: [
      {
        file: "/WebScience/Studies/content-scripts/socialMediaAccountExposure-fb.js"
      }
    ],
    runAt: "document_idle"
  });

  // Listen for SocialMediaAccountExposure messages from content scripts
  WebScience.Utilities.Messaging.registerListener("WebScience.Studies.SocialMediaAccountExposure", (message, sender, sendResponse) => {
      // If the page content message is not from a tab, or if we are not tracking
      // the tab, ignore the message
      // Neither of these things should happen!
    debugLog("socialMediaAccountExposure.Facebook: " + JSON.stringify(message));
      if(!("tab" in sender) || !(sender.tab.id in currentTabInfo)) {
          debugLog("Warning: unexpected social media account exposure update");
          return;
      }
    storage.set("" + nextSocialMediaAccountExposureIdCounter.incrementAndGet(), message);
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