import { localforage } from "/WebScience/dependencies/localforagees6.min.js"

const debug = true;

/* Navigation - This module is used to run studies that track the user's
   navigation of and attention to webpages. */

/* initializeStorage - Opens (and if necessary creates) a database for storing
   study data. */
var storage = {
  pages: null, // key-value store for information about page loads
  configuration: null // key-value store for study state
};

async function initializeStorage() {
  await localforage.config({
      driver: [localforage.INDEXEDDB,
               localforage.WEBSQL,
               localforage.LOCALSTORAGE],
  });

  storage.pages = await localforage.createInstance( { name: "navigation.pages" } );
  storage.configuration = await localforage.createInstance( { name: "navigation.configuration" } );
}

/* runStudy - Starts a Navigation study. Note that only one study is supported
   per extension. runStudy requires an options object with the following
   properties.

     * domains - array of domains to run the study on (default [ ])

     * attention - whether to record user attention to webpages (default false)

     * pageContent - whether to record page content (default false) */
// TODO implement pageContent option

export async function runStudy({
  domains = [ ],
  attention = false,
  pageContent = false
}) {

  await initializeStorage();

  // Generate the regular expression object for domain matching
  // Uses the built-in regular expression library for performance
  var domainMatchRE = "^";
  for (var i = 0; i < domains.length; i++)
    domainMatchRE = domainMatchRE + "(?:(?:http|https)://(?:[A-Za-z0-9\\-]+\\.)*" + domains[i] + "(?:$|/.*))|"
  domainMatchRE = domainMatchRE.substring(0, domainMatchRE.length - 1)
  const domainMatcher = new RegExp(domainMatchRE);

  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextPageId = await storage.configuration.getItem("nextPageId");
  if(nextPageId == null) {
    nextPageId = 0;
    await storage.configuration.setItem("nextPageId", nextPageId);
  }

  // Keep track of information about pages with matching domains that are currently loaded into a tab
  // If a tab ID is in this object, the page currently contained in that tab has a matching domain
  var currentTabInfo = {}

  // Helper function for when a webpage loads into a tab
  // If the webpage doesn't have a matching domain, it's ignored
  // If the webpage does have a matching domain, create a new record
  async function startTrackingTab(tabId, url) {
    if(!domainMatcher.test(url))
      return;
    if(tabId in currentTabInfo)
      return;
    currentTabInfo[tabId] = {
      pageId: nextPageId,
      url: url,
      referrer: "",
      visitStart: Date.now(),
      visitEnd: -1,
      attentionDuration: 0,
      attentionCount: 0
    };
    debugLog("startTrackingTab: " + JSON.stringify(currentTabInfo[tabId]));
    nextPageId = nextPageId + 1;
    storage.configuration.setItem("nextPageId", nextPageId);
  };

  // Helper function for when a webpage with a matching domain unloads from a tab
  async function stopTrackingTab(tabId) {
    if(!(tabId in currentTabInfo))
      return;

    var tabInfoToSave = Object.assign({}, currentTabInfo[tabId]);
    tabInfoToSave.visitEnd = Date.now();
    delete currentTabInfo[tabId];

    debugLog("stopTrackingTab: " + JSON.stringify(tabInfoToSave));

    storage.pages.setItem(tabInfoToSave.pageId, tabInfoToSave);
  };

  // Set up the content script for determining the referrer of a page with a matching domain
  var contentScriptMatches = [ ];
  for (var i = 0; i < domains.length; i++)
    contentScriptMatches.push("*://*." + domains[i] + "/*");
  await browser.contentScripts.register({
      matches: contentScriptMatches,
      js: [ { file: "/WebScience/content-scripts/referrer.js" } ],
      runAt: "document_start"
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    if((message == null) || !("type" in message) || message.type != "WebScience.referrerUpdate")
      return;

    // If the referrer message isn't from a tab or we aren't tracking the tab,
    // ignore the message (neither of these things should happen)
    if(!("tab" in sender) || !(sender.tab.id in currentTabInfo))
      return;

    currentTabInfo[sender.tab.id].referrer = message.content.referrer;
    debugLog("referrerUpdate: " + JSON.stringify(currentTabInfo[sender.tab.id]));
  });

  // Keep track of the currently focused window, the currently active tab,
  // whether to record the user's attention for that window and tab combination,
  // and the start time of the current attention tracking period
  const attentionState = {
    currentFocusedWindow: -1,
    currentActiveTab: -1,
    currentActiveTabNeedsAttentionTracking: false,
    startOfCurrentAttention: -1
  };

  // Helper functions for determining whether a specified tab and/or window have the user's attention
  function checkTabAndWindowHaveAttention(tabId, windowId) {
    return ((attentionState.currentActiveTab == tabId) && (attentionState.currentFocusedWindow == windowId));
  }

  function checkWindowHasAttention(windowId) {
    return (attentionState.currentFocusedWindow == windowId);
  }

  // Helper function for starting a new user attention span
  // If the newly active window and tab don't contain a page with a matching domain, ignore them
  function startAttention(newTabId, newWindowId) {
    if(!attention)
      return;
    attentionState.currentFocusedWindow = newWindowId;
    attentionState.currentActiveTab = newTabId;
    attentionState.currentActiveTabNeedsAttentionTracking = newTabId in currentTabInfo;
    attentionState.startOfCurrentAttention = Date.now();
    debugLog("startAttention: " + JSON.stringify(attentionState));
  }

  // Helper function for ending a user attention span
  // If the previously active window and tab contained a page with a matching domain, update the attention information
  // Note that the retainWindow parameter is needed to handle the case where the user closes the active tab in the focused window
  function stopAttention(retainWindow) {
    if(!attention)
      return;

    // If the tab that's losing attention was getting tracked, update the attention information for that tab
    if(attentionState.currentActiveTabNeedsAttentionTracking) {
      currentTabInfo[attentionState.currentActiveTab].attentionDuration = currentTabInfo[attentionState.currentActiveTab].attentionDuration + (Date.now() - attentionState.startOfCurrentAttention);
      currentTabInfo[attentionState.currentActiveTab].attentionCount = currentTabInfo[attentionState.currentActiveTab].attentionCount + 1;
    }

    if(!retainWindow)
      attentionState.currentFocusedWindow = -1;
    attentionState.currentActiveTab = -1;
    attentionState.startOfCurrentAttention = -1;
    attentionState.currentActiveTabNeedsAttentionTracking = false;
    debugLog("stopAttention");
  };

  // Get the currently active tab and current window
  // Note that we're assuming the current window is focused
  // If the page in that tab has a matching domain, start tracking it and shift attention to it
  var currentActiveTabAtStartup = await browser.tabs.query({ windowId: browser.windows.WINDOW_ID_CURRENT, active: true });
  if(currentActiveTabAtStartup.length > 0) {
    startTrackingTab(currentActiveTabAtStartup[0].id, currentActiveTabAtStartup[0].url);
    startAttention(currentActiveTabAtStartup[0].id, currentActiveTabAtStartup[0].windowId);
  }

  // Get the current set of open tabs
  // Store information about any tab that contains a webpage with a matching domain
  // Ignore the currently active tab
  var currentTabsAtStartup = await browser.tabs.query({ windowType: "normal" });
  if (currentTabsAtStartup.length > 0)
    for (var i = 0; i < currentTabsAtStartup.length; i++)
      if(currentTabsAtStartup[i].id != currentActiveTabAtStartup[0].id)
        startTrackingTab(currentTabsAtStartup[i].id, currentTabsAtStartup[i].url);

  // Check when the webpage contained in a tab changes, because the browser might be
  // navigating from or to a webpage with a matching domain
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Ignore changes that don't involve the URL
    if (!("url" in changeInfo))
      return;

    // If the user's attention is currently on this tab, end the attention span
    var userAttentionOnTab = checkTabAndWindowHaveAttention(tabId, tab.windowId);
    if (userAttentionOnTab)
      stopAttention(false);

    // If this is a navigation from a page with a matching domain, record the event
    stopTrackingTab(tabId);

    // If this is a navigation to a page with a matching domain, record the event
    startTrackingTab(tabId, changeInfo.url);

    // If the user's attention is currently on this tab, start an attention span
    if (userAttentionOnTab)
      startAttention(tabId, tab.windowId);
  });

  // Check when the user closes a tab, because the page loaded in the tab might
  // have attention and a matching domain
  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if(checkTabAndWindowHaveAttention(tabId, removeInfo.windowId))
      stopAttention(true);
    stopTrackingTab(tabId);
  });

  // Check when the user activates a tab, because the user might be changing
  // attention from or to a tab containing a webpage with a matching domain
  browser.tabs.onActivated.addListener(activeInfo => {
    // If this is a non-browser tab, ignore it
    if(activeInfo.tabId == browser.tabs.TAB_ID_NONE)
      return;

    // If the tab update is not in the focused window, ignore it
    if(!checkWindowHasAttention(activeInfo.windowId))
      return;

    // Otherwise, shift attention from the old tab to the new tab
    stopAttention(false);
    startAttention(activeInfo.tabId, activeInfo.windowId);
  });

  // Check when the window focus changes, because the user might be changing
  // attention from or to a tab containing a webpage with a matching domain
  browser.windows.onFocusChanged.addListener(async windowId => {

    stopAttention(false);

    // Try to learn more about the window
    // Note that this can result in an error for non-browser windows
    var windowDetails = { type: "unknown" };
    try {
      windowDetails = await browser.windows.get(windowId);
    }
    catch(error) {
    }

    // If all windows have lost focus or the focused window isn't a browser window, don't resume attention tracking
    if((windowId == browser.windows.WINDOW_ID_NONE) || (windowDetails.type != "normal"))
      return;

    // If there isn't an active tab in the new window, don't resume attention tracking
    var tabInfo = await browser.tabs.query({ windowId: windowId, active: true });
    if (tabInfo.length == 0)
      return;

    startAttention(tabInfo[0].id, windowId);

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
    "navigation.pages": { },
    "navigation.configuration": { }
  };
  await storage.pages.iterate((value, key, iterationNumber) => {
    output["navigation.pages"][key] = value;
  });
  await storage.configuration.iterate((value, key, iterationNumber) => {
    output["navigation.configuration"][key] = value;
  });
  return JSON.stringify(output);
}
