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
 * Creates regex strings for domains of interest and short domains
 * @param {String[]} domains - domains of interest
 * @param {String[]} shortDomains - short domains
 * @param {Object} - Regular expression strings
 */
function createRegex(domains, shortDomains) {
  let domainRegexString = WebScience.Utilities.Matching.createUrlRegexString(domains);
  let shortDomainRegexString = WebScience.Utilities.Matching.createUrlRegexString(shortDomains);
  let regexes = {
    domainRegexString: domainRegexString,
    shortDomainRegexString: shortDomainRegexString
  };
  return regexes;
}

/**
 * setRegex function stores the regular expression strings corresponding to 
 * domains and link shortening domains in local storage.
 * These storage items are accessible from content scripts during the matching phase.
 * Note : It's not possible to store RegExp 
 * (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/set)
 * 
 * @param {String[]} domains - domains of interest
 * @param {String[]} shortDomains - short domains
 */
async function setRegex(domains, shortDomains) {
  let storageObj = createRegex(domains, shortDomains);
  await browser.storage.local.set(storageObj);
}

/**
 * Function checks and sets (if not set already) regular expression strings
 * for domain matching in the storage.
 * @param {String[]} domains - domains of interest
 * @param {String[]} shortDomains - short domains
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
  var nextPageIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.LinkExposure.nextPageId")).initialize();
  let shortDomains = WebScience.Utilities.LinkResolution.getShortDomains();
  await setCode(domains, shortDomains);
  const {domainRegexString, shortDomainRegexString} = createRegex(domains, shortDomains);
  const shortDomainMatcher = new RegExp(shortDomainRegexString);
  const urlMatcher = new RegExp(domainRegexString);

  // Add the content script for checking links on pages
  await browser.contentScripts.register({
    matches: ["*://*/*"],
    js: [{
        file: "/WebScience/Studies/content-scripts/utils.js"
      },
      {
        file: "/WebScience/Studies/content-scripts/ampResolution.js"
      },
      {
        file: "/WebScience/Studies/content-scripts/linkExposure.js"
      }
    ],
    runAt: "document_idle"
  });

  // Listen for LinkExposure messages from content script
  WebScience.Utilities.Messaging.registerListener("WebScience.linkExposure", (message, sender, sendResponse) => {
    if (!("tab" in sender)) {
      debugLog("Warning: unexpected page content update");
      return;
    }
    // Resolve links from known short domains
    if (shortDomainMatcher.test(message.link.href)) {
      WebScience.Utilities.LinkResolution.resolveUrl(message.link.href).then(resolvedURL => {
        // If resolved link belongs to the domains of interest
        if (urlMatcher.test(resolvedURL.dest)) {
          message.link.dest = resolvedURL.dest;
          debugLog("storing " + JSON.stringify(message));
          storage.set("" + nextPageIdCounter.incrementAndGet(), message);
        }
      }).catch(error => {
        // For failed resolutions save exposure information along with error message
        message.link.error = error.message;
          debugLog("storing " + JSON.stringify(message));
          storage.set("" + nextPageIdCounter.incrementAndGet(), message);
      });
    } else {
      debugLog("storing " + JSON.stringify(message));
      storage.set("" + nextPageIdCounter.incrementAndGet(), message);
    }
  }, {
    referrer: "string",
    url: "string",
    link: "object"
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
 * @private
 */
function isEmpty(obj) {
  return !obj || Object.keys(obj).length === 0;
}