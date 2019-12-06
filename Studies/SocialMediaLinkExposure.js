import { localforage } from "/WebScience/dependencies/localforagees6.min.js"
import * as WebScience from "/WebScience/WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Studies.SocialMediaLinkExposure");

/* SocialMediaLinkExposure - This module is used to run studies that track the user's
   exposure to links through social media. */

// Storage spaces for navigation studies
var storage = {
  pages: null, // key-value store for information about page loads
  configuration: null // key-value store for study state
};

// Helper function to set up the storage spaces
async function initializeStorage() {
  await localforage.config({
      driver: [localforage.INDEXEDDB,
               localforage.WEBSQL,
               localforage.LOCALSTORAGE],
  });

  storage.pages = await localforage.createInstance( { name: "socialMediaLinkExposure.pages" } );
  storage.configuration = await localforage.createInstance( { name: "socialMediaLinkExposure.configuration" } );
}

// Helper function to resolve short urls
async function resolveURL(link) {
      fetch(link, {
        // Manual mode doesn't seem to return the URL to follow 
        // https://fetch.spec.whatwg.org/#atomic-http-redirect-handling
        // TODO  : Is there a better way to get the url
        //redirect: "manual",
      })
        .then(
          function (response) {
            if(response.url != link) {
              debugLog("redirected to" + response.url);
              // TODO : send this link back to the content script for processing further
              return response.url
            }
          });
}
/* runStudy - Starts a SocialMediaLinkExposure study. Note that only one study is supported
   per extension. runStudy requires an options object with the following
   property.

     * domains - array of domains for tracking link exposure events through social media */

export async function runStudy({
  domains = [ ],
  shortdomains = [],
  socialmedia = []
}) {

  await initializeStorage();

  // Use a unique identifier for each webpage the user visits
  var nextPageId = await storage.configuration.getItem("nextPageId");
  if(nextPageId == null) {
    nextPageId = 0;
    await storage.configuration.setItem("nextPageId", nextPageId);
  }

  var sm = ["facebook.com"];
  // create code for url and short domain matching
  var injectcode = "const smURLMatchRE = \"" + 
          WebScience.Utilities.Matching.createUrlRegexString(sm).replace(/\\/g, "\\\\") + 
            "\"; const smURLMatcher = new RegExp(smURLMatchRE);"
  console.log("code is "+injectcode);

  // Add a dynamically generated content script to every HTTP/HTTPS page that
  // supports checking for whether a link's domain matches the set for the study
  // Note that we have to carefully escape the domain matching regular expression
  await browser.contentScripts.register({
      //matches: socialmedia,
      matches: [ "*://*/*" ],
      js: [
        {
          code: injectcode
        }
      ],
      runAt: "document_start"
  });

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
      //matches: socialmedia,
      matches: [ "*://*/*" ],
      js: [ { file: "/WebScience/Studies/content-scripts/socialMediaLinkExposure.js" } ],
      runAt: "document_idle"
  });

  // Listen for requests to expand short urls
  browser.runtime.onMessage.addListener((message, sender) => {
    if((message == null) ||
        !("type" in message) ||
        message.type != "WebScience.shortLinks")
      return;

    // If the link exposure message isn't from a tab, ignore the message
    // (this shouldn't happen)
    if(!("tab" in sender))
      return;


    for(var link of message.content.links) {
      resolveURL(link);
    }

    // Save the link exposure to the database
    storage.pages.setItem("" + nextPageId, message.content);
    nextPageId = nextPageId + 1;
    storage.configuration.setItem("nextPageId", nextPageId);
    debugLog("short urls: " + JSON.stringify(message.content));
  });

  // Listen for initial link exposure messages and save them to the database
  browser.runtime.onMessage.addListener((message, sender) => {
    if((message == null) ||
        !("type" in message) ||
        message.type != "WebScience.socialMediaLinkExposureInitial")
      return;


    // If the link exposure message isn't from a tab, ignore the message
    // (this shouldn't happen)
    if(!("tab" in sender))
      return;

    // TODO check whether the tab's window is the current browser window, since
    // the content script can only tell whether its tab is active within its window
    // One option: use browser.windows.getCurrent (asynchronous)
    // Another option: set a listener for browser.windows.onFocusChanged to keep track of
    //  the current window (synchronous in this context)
    // Another option: reuse the window and tab tracking from WebScience.Navigation (synchronous)

    // Save the link exposure to the database
    storage.pages.setItem("" + nextPageId, message.content);
    nextPageId = nextPageId + 1;
    storage.configuration.setItem("nextPageId", nextPageId);
    debugLog("socialMediaLinkExposureInitial: " + JSON.stringify(message.content));
  });

  // Listen for requests to expand shortened URLs
  browser.runtime.onMessage.addListener((message, sender) => {
    if((message == null) ||
        !("type" in message) ||
        message.type != "WebScience.expandURL")
      debugLog("expand url :"+ JSON.stringify(message.content));
      return;
  });

}

/* Utilities */

// Helper function that dumps the navigation study data as an object
export async function getStudyDataAsObject() {
  var output = {
    "socialMediaLinkExposure.pages": { },
    "socialMediaLinkExposure.configuration": { }
  };
  await storage.pages.iterate((value, key, iterationNumber) => {
    output["socialMediaLinkExposure.pages"][key] = value;
  });
  await storage.configuration.iterate((value, key, iterationNumber) => {
    output["socialMediaLinkExposure.configuration"][key] = value;
  });
  return output;
}
