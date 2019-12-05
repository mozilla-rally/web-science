import * as WebScience from "/WebScience/WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Studies.LinkExposure");

/*  LinkExposure - This module is used to run studies that track the user's
    exposure to links. */

var storage = null;

/* runStudy - Starts a LinkExposure study. Note that only one study is supported
   per extension. runStudy requires an options object with the following
   property.

        * domains - array of domains for tracking link exposure events */

export async function runStudy({
  domains = [ ],
  shortdomains = []
}) {

  await initializeStorage();

  // Use a unique identifier for each webpage the user visits
  var nextPageId = await storage.configuration.getItem("nextPageId");
  if(nextPageId == null) {
    nextPageId = 0;
    await storage.configuration.setItem("nextPageId", nextPageId);
  }

  // create code for url and short domain matching
  var injectcode = "const urlMatchRE = \"" + 
  WebScience.Utilities.Matching.createUrlRegexString(domains).replace(/\\/g, "\\\\") + 
    "\"; const urlMatcher = new RegExp(urlMatchRE);" +  "const shortURLMatchRE = \"" + 
          WebScience.Utilities.Matching.createUrlRegexString(shortdomains).replace(/\\/g, "\\\\") + 
            "\"; const shortURLMatcher = new RegExp(shortURLMatchRE);"
  console.log("code is "+injectcode);

  // Add a dynamically generated content script to every HTTP/HTTPS page that
  // supports checking for whether a link's domain matches the set for the study
  // Note that we have to carefully escape the domain matching regular expression
  await browser.contentScripts.register({
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
      matches: [ "*://*/*" ],
      js: [ { file: "/WebScience/Studies/content-scripts/linkExposure.js" } ],
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


    for (var link of message.content.links) {
        var p = WebScience.Utilities.LinkResolution.resolveURL(link.href);
        p.then(function (chain) {
          debugLog("resolve urls");
          for (var i = 0; i < chain.length; i++) {
            debugLog("next url " + chain[i]);
          }
        }, function (err) {
          debugLog("resolve error " + err);
        });
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
        message.type != "WebScience.linkExposureInitial")
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
    debugLog("linkExposureInitial: " + JSON.stringify(message.content));
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

// Helper function that dumps the link exposure study data as an object
export async function getStudyDataAsObject() {
    if(storage != null)
        return await storage.getContentsAsObject();
    return null;
}
