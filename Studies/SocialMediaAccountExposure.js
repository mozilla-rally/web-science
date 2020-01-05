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
}) {

  storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.SocialMediaAccountExposure")).initialize();
  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextPageIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.SocialMediaAccountExposure.nextPageId")).initialize();

  // create code for url and short domain matching
  let ytChannelMatchCode = "const ytChannelMatchRE = \"" + 
  WebScience.Utilities.Matching.createUrlRegexString(ytchannels).replace(/\\/g, "\\\\") + 
    "\"; const ytChannelMatcher = new RegExp(ytChannelMatchRE);";

  await browser.contentScripts.register({
      matches: [ "*://*.youtube.com/*" ],
      js: [
        {
          code: ytChannelMatchCode
        }
      ],
      runAt: "document_start"
  });

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
      matches: [ "*://*.youtube.com/*" ],
      js: [ { file: "/WebScience/Studies/content-scripts/socialMediaAccountExposure-youtube.js" } ],
      runAt: "document_idle"
  });

  // create code for url and short domain matching
  let fbAccountMatchCode = "const fbAccountMatchRE = \"" + 
  WebScience.Utilities.Matching.createUrlRegexString(fbaccounts).replace(/\\/g, "\\\\") + 
    "\"; const fbAccountMatcher = new RegExp(fbAccountMatchRE);";

  await browser.contentScripts.register({
    matches: ["*://*.facebook.com/*"],
      js: [
        {
          code: fbAccountMatchCode
        }
      ],
      runAt: "document_start"
  });

  await browser.contentScripts.register({
    matches: ["*://*.facebook.com/*"],
    js: [ { file: "/WebScience/Studies/content-scripts/socialMediaAccountExposure-fb.js" }],
    runAt: "document_idle"
  });

  // Listen for SocialMediaAccountExposure.Youtube messages from content script
  WebScience.Utilities.Messaging.registerListener("WebScience.Studies.SocialMediaAccountExposure.Youtube", (message, sender, sendResponse) => {
      // If the page content message is not from a tab, or if we are not tracking
      // the tab, ignore the message
      // Neither of these things should happen!
    debugLog("socialMediaAccountExposure.Youtube: " + JSON.stringify(message));
      if(!("tab" in sender) || !(sender.tab.id in currentTabInfo)) {
          debugLog("Warning: unexpected page content update");
          return;
      }
    storage.set("" + nextPageIdCounter.incrementAndGet(), message);
  }, {
    title : "string",
    url : "string",
    channel : "string"
  });

  // Listen for SocialMediaAccountExposure.Facebook messages from content script
  WebScience.Utilities.Messaging.registerListener("WebScience.Studies.SocialMediaAccountExposure.Facebook", (message, sender, sendResponse) => {
      // If the page content message is not from a tab, or if we are not tracking
      // the tab, ignore the message
      // Neither of these things should happen!
    debugLog("socialMediaAccountExposure.Facebook: " + JSON.stringify(message));
      if(!("tab" in sender) || !(sender.tab.id in currentTabInfo)) {
          debugLog("Warning: unexpected page content update");
          return;
      }
    storage.set("" + nextPageIdCounter.incrementAndGet(), message);
  }, {
    posts : "string"
  });

}

/* Utilities */

// Helper function that dumps the navigation study data as an object
export async function getStudyDataAsObject() {
  var output = {
    "socialMediaAccountExposure.pages": { },
    "socialMediaAccountExposure.configuration": { }
  };
  await storage.pages.iterate((value, key, iterationNumber) => {
    output["socialMediaAccountExposure.pages"][key] = value;
  });
  await storage.configuration.iterate((value, key, iterationNumber) => {
    output["socialMediaAccountExposure.configuration"][key] = value;
  });
  return output;
}
