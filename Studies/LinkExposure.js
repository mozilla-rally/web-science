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
 * setRegex function stores the regular expression strings corresponding to 
 * domains and link shortening domains in the local storage.
 * These storage items are accessible from content scripts during the matching phase.
 * Note : It's not possible to store RegExp 
 * (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/set)
 * 
 * @param {Array} domains - domains of interest
 * @param {Array} shortDomains - link shortening domains
 */
async function setRegex(domains, shortDomains) {
  let domainRegexString = WebScience.Utilities.Matching.createUrlRegexString(domains);
  let shortDomainRegexString = WebScience.Utilities.Matching.createUrlRegexString(shortDomains);
  let storageObj = {
    domainRegexString: domainRegexString,
    shortDomainRegexString: shortDomainRegexString
  };
  await browser.storage.local.set(storageObj);
}

/**
 * Function checks and sets (if not set already) regular expressions
 * for domain matching in the storage.
 * @param {Array} domains - domains of interest
 * @param {Array} shortDomains - link shortening domains
 */
async function setCode(domains, shortDomains) {
  let dregex = await browser.storage.local.get("domainRegexString");
  let sdregex = await browser.storage.local.get("shortDomainRegexString");
  if (isEmpty(dregex) || isEmpty(sdregex)) {
    setRegex(domains, shortDomains);
  }
}

/**
 * @name LinkExposure.runStudy starts the LinkExposure study.
 * 
 * @param {Array} domains - Array of domains to track 
 */
export async function runStudy({
  domains = [],
}) {

  storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.LinkExposure")).initialize();
  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextPageIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.LinkExposure.nextPageId")).initialize();
  await setCode(domains, WebScience.Utilities.LinkResolution.getShortDomains());

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
    matches: ["*://*/*"],
    js: [{
        file: "/WebScience/Studies/content-scripts/ElementProperties.js"
      },
      {
        file: "/WebScience/Studies/content-scripts/Utils.js"
      },
      {
        file: "/WebScience/Studies/content-scripts/AmpResolution.js"
      },
      {
        file: "/WebScience/Studies/content-scripts/linkExposure.js"
      }
    ],
    runAt: "document_idle"
  });

  // Listen for debug messages
  browser.runtime.onMessage.addListener((message, sender) => {
    if ((message == null) ||
      !("type" in message) ||
      message.type != "WebScience.debug")
      return;
    // If the link exposure message isn't from a tab, ignore the message
    // (this shouldn't happen)
    if (!("tab" in sender))
      return;
    debugLog("debug messages" + JSON.stringify(message));
  });

  // Listen for request to expand short urls
  WebScience.Utilities.Messaging.registerListener("WebScience.shortLinks", (message, sender, sendResponse) => {
    if (!("tab" in sender)) {
      debugLog("Warning: unexpected page content update");
      return;
    }
    let id = sender.tab.id;
    for (var link of message.links) {
      WebScience.Utilities.LinkResolution.resolveURL(link.href).then(x => browser.tabs.sendMessage(id, x)).catch(error => debugLog("error in resolution " + error));
    }
  }, {
    referrer: "string",
    url: "string",
    links: "object"
  });

  // Listen for LinkExposure messages
  WebScience.Utilities.Messaging.registerListener("WebScience.linkExposure", (message, sender, sendResponse) => {
    if (!("tab" in sender)) {
      debugLog("Warning: unexpected page content update");
      return;
    }
    debugLog("storing " + JSON.stringify(message));
    storage.set("" + nextPageIdCounter.incrementAndGet(), message);
  }, {
    referrer: "string",
    url: "string",
    links: "object"
  });

}

/* Utilities */

// Helper function that dumps the navigation study data as an object
export async function getStudyDataAsObject() {
  var output = {
    "LinkExposure.pages": {},
    "LinkExposure.configuration": {}
  };
  await storage.pages.iterate((value, key, iterationNumber) => {
    output["LinkExposure.pages"][key] = value;
  });
  await storage.configuration.iterate((value, key, iterationNumber) => {
    output["LinkExposure.configuration"][key] = value;
  });
  return output;
}

/**
 * Function tests whether a given object is empty
 * @param {Object} obj - Object to test
 * @returns {boolean} - true if the object is empty
 */
function isEmpty(obj) {
  return !obj || Object.keys(obj).length === 0;
}