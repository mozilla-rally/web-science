import { localforage } from "/WebScience/dependencies/localforagees6.min.js"

const debug = true;

/* LinkExposure - This module is used to run studies that track the user's
   exposure to links. */

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

  storage.pages = await localforage.createInstance( { name: "linkExposure.pages" } );
  storage.configuration = await localforage.createInstance( { name: "linkExposure.configuration" } );
}

/* runStudy - Starts a LinkExposure study. Note that only one study is supported
   per extension. runStudy requires an options object with the following
   property.

     * domains - array of domains for tracking link exposure events */

export async function runStudy({
  domains = [ ]
}) {

  await initializeStorage();

  // Generate the regular expression object for domain matching
  // Uses the built-in regular expression library for performance
  var domainMatchRE = "^(?:http|https)://(?:[A-Za-z0-9\\-]+\\.)*(?:";
  for (const domain of domains)
    domainMatchRE = domainMatchRE + domain.replace(/\./g, "\\.") + "|"
  domainMatchRE = domainMatchRE.substring(0, domainMatchRE.length - 1) + ")(?:$|/.*)"
  const domainMatcher = new RegExp(domainMatchRE);

  // Use a unique identifier for each webpage the user visits
  var nextPageId = await storage.configuration.getItem("nextPageId");
  if(nextPageId == null) {
    nextPageId = 0;
    await storage.configuration.setItem("nextPageId", nextPageId);
  }

  // Add a dynamically generated content script to every HTTP/HTTPS page that
  // supports checking for whether a link's domain matches the set for the study
  // Note that we have to carefully escape the domain matching regular expression
  await browser.contentScripts.register({
      matches: [ "*://*/*" ],
      js: [ { code: "const domainMatchRE = \"" + domainMatchRE.replace(/\\/g, "\\\\") + "\"; const domainMatcher = new RegExp(domainMatchRE);" } ],
      runAt: "document_start"
  });

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
      matches: [ "*://*/*" ],
      js: [ { file: "/WebScience/content-scripts/linkExposure.js" } ],
      runAt: "document_idle"
  });

  // Listen for initial link exposure messages and save them to the database
  browser.runtime.onMessage.addListener((message, sender) => {
    if((message == null) || !("type" in message) || message.type != "WebScience.linkExposureInitial")
      return;

    // If the link exposure message isn't from a tab, ignore the message
    // (this shouldn't happen)
    if(!("tab" in sender))
      return;

    // TODO check whether the tab's window is the current browser window, since
    // the content script can only tell whether its tab is active within its window
    // One option: use browser.windows.getCurrent (asynchronous)
    // Another option: reuse the window and tab tracking from WebScience.Navigation (synchronous)

    // Save the link exposure to the database
    storage.pages.setItem("" + nextPageId, message.content);
    nextPageId = nextPageId + 1;
    debugLog("linkExposureInitial: " + JSON.stringify(message.content));
  });

}

/* Utilities */

function debugLog(text) {
  if(debug == true)
    console.log(text);
}

// Helper function that dumps the navigation study data as text
export async function getStudyDataAsText() {
  var output = {
    "linkExposure.pages": { },
    "linkExposure.configuration": { }
  };
  await storage.pages.iterate((value, key, iterationNumber) => {
    output["linkExposure.pages"][key] = value;
  });
  await storage.configuration.iterate((value, key, iterationNumber) => {
    output["linkExposure.configuration"][key] = value;
  });
  return JSON.stringify(output);
}
