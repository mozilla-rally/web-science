import { localforage } from "/WebScience/dependencies/localforagees6.min.js"
import * as WebScience from "/WebScience/WebScience.js"
var debugLog = WebScience.Utilities.DebugLog.debugLog;

/* Navigation - This module is used to run studies that track the user's
   navigation of and attention to webpages. */

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

  storage.pages = await localforage.createInstance( { name: "navigation.pages" } );
  storage.configuration = await localforage.createInstance( { name: "navigation.configuration" } );
}

/* runStudy - Starts a Navigation study. Note that only one study is supported
   per extension. runStudy requires an options object with the following
   properties.

     * domains - array of domains for tracking navigation events (default [ ])

     * trackUserAttention - whether to record user attention to webpages (default false)

     * savePageContent - whether to record page content (default false) */

export async function runStudy({
  domains = [ ],
  trackUserAttention = false,
  savePageContent = false
}) {

  await initializeStorage();

  const urlMatcher = new WebScience.Utilities.Matching.UrlMatcher(domains);

  // Use a unique identifier for each webpage the user visits that has a matching domain
  var nextPageId = await storage.configuration.getItem("nextPageId");
  if(nextPageId == null) {
    nextPageId = 0;
    await storage.configuration.setItem("nextPageId", nextPageId);
  }

  // Keep track of information about pages with matching domains that are currently loaded into a tab
  // If a tab ID is in this object, the page currently contained in that tab has a matching domain
  // Note that this is currently implemented with an object, we might want to switch it to a Map
  var currentTabInfo = { }

  // Helper function for when a webpage loads into a tab
  // If the webpage doesn't have a matching domain, it's ignored
  // If the webpage does have a matching domain, create a new record
  async function startPageVisit(tabId, url) {
    if(!urlMatcher.testUrl(url))
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
      attentionSpanCount: 0,
      attentionSpanStarts: [ ],
      attentionSpanEnds: [ ],
      pageContent: ""
    };
    debugLog("startPageVisit: " + JSON.stringify(currentTabInfo[tabId]));
    nextPageId = nextPageId + 1;
    storage.configuration.setItem("nextPageId", nextPageId);
  };

  // Helper function for when a webpage with a matching domain unloads from a tab
  async function stopPageVisit(tabId) {
    if(!(tabId in currentTabInfo))
      return;

    var tabInfoToSave = Object.assign({}, currentTabInfo[tabId]);
    tabInfoToSave.visitEnd = Date.now();
    delete currentTabInfo[tabId];

    debugLog("stopPageVisit: " + JSON.stringify(tabInfoToSave));

    // Store the final set of information for the page
    storage.pages.setItem("" + tabInfoToSave.pageId, tabInfoToSave);
  };

  // Build the domain matching set for content scripts
  var contentScriptMatches = [ ];
  for (const domain of domains)
    contentScriptMatches.push("*://*." + domain + "/*");

  // Set up the content script for determining the referrer of a page with a matching domain
  await browser.contentScripts.register({
      matches: contentScriptMatches,
      js: [ { file: "/WebScience/Studies/content-scripts/referrer.js" } ],
      runAt: "document_start"
  });

  // Listen for a referrer update message and associate it with the current
  // set of tab information
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

  // Set up the content script for saving page content
  if(savePageContent) {
    await browser.contentScripts.register({
        matches: contentScriptMatches,
        js: [ { file: "/WebScience/Studies/content-scripts/pageContent.js" } ],
        runAt: "document_idle"
    });

    browser.runtime.onMessage.addListener((message, sender) => {
      if((message == null) ||
          !("type" in message) ||
          message.type != "WebScience.pageContentUpdate")
        return;

      // If the page content message isn't from a tab or we aren't tracking the tab,
      // ignore the message (neither of these things should happen)
      if(!("tab" in sender) || !(sender.tab.id in currentTabInfo))
        return;

      currentTabInfo[sender.tab.id].pageContent = message.content.pageContent;
      debugLog("pageContentUpdate: " + JSON.stringify(currentTabInfo[sender.tab.id]));
    });
  }

  // Keep track of the currently focused window, the currently active tab,
  // whether to record the user's attention for that window and tab combination,
  // and the start time of the current attention tracking period
  const attentionState = {
    currentFocusedWindow: -1,
    currentActiveTab: -1,
    currentActiveTabNeedsAttentionTracking: false,
    startOfCurrentAttentionSpan: -1
  };

  // Helper function for determining whether a specified tab and window have the user's attention
  function checkTabAndWindowHaveAttention(tabId, windowId) {
    return ((attentionState.currentActiveTab == tabId) &&
            (attentionState.currentFocusedWindow == windowId));
  }

  // Helper function for determining whether a specified window has the user's attention
  function checkWindowHasAttention(windowId) {
    return (attentionState.currentFocusedWindow == windowId);
  }

  // Helper function for starting a new user attention span
  // If the newly active window and tab don't contain a page with a matching domain, ignore them
  function startAttentionSpan(newTabId, newWindowId) {
    if(!trackUserAttention)
      return;
    attentionState.currentFocusedWindow = newWindowId;
    attentionState.currentActiveTab = newTabId;
    attentionState.currentActiveTabNeedsAttentionTracking = newTabId in currentTabInfo;
    attentionState.startOfCurrentAttentionSpan = Date.now();
    debugLog("startAttentionSpan: " + JSON.stringify(attentionState));
  }

  // Helper function for ending a user attention span
  // If the previously active window and tab contained a page with a matching
  //  domain, update the attention information
  // Note that the retainWindow parameter is needed to handle the case where
  //  the user closes the active tab in the focused window
  function stopAttentionSpan(retainWindow) {
    if(!trackUserAttention)
      return;

    // If the tab that's losing attention was getting tracked, update the
    //  attention information for that tab
    if(attentionState.currentActiveTabNeedsAttentionTracking) {
      var currentTime = Date.now();
      currentTabInfo[attentionState.currentActiveTab].attentionDuration =
            currentTabInfo[attentionState.currentActiveTab].attentionDuration
            + (currentTime - attentionState.startOfCurrentAttentionSpan);
      currentTabInfo[attentionState.currentActiveTab].attentionSpanCount =
            currentTabInfo[attentionState.currentActiveTab].attentionSpanCount + 1;
      currentTabInfo[attentionState.currentActiveTab].attentionSpanStarts
            .push(attentionState.startOfCurrentAttentionSpan);
      currentTabInfo[attentionState.currentActiveTab].attentionSpanEnds.push(currentTime);
    }

    if(!retainWindow)
      attentionState.currentFocusedWindow = -1;
    attentionState.currentActiveTab = -1;
    attentionState.startOfCurrentAttentionSpan = -1;
    attentionState.currentActiveTabNeedsAttentionTracking = false;
    debugLog("stopAttentionSpan");
  };

  // Get the currently active tab and current window when the study starts
  //  running in this browser session
  // Note that we're assuming the current window is focused
  // If the page in that tab has a matching domain, start tracking it and shift attention to it
  var activeTabAtStartup = null;
  var activeTabsAtStartup = await browser.tabs.query(
      { windowId: browser.windows.WINDOW_ID_CURRENT, active: true });
  if(activeTabsAtStartup.length > 0) {
    activeTabAtStartup = activeTabsAtStartup[0];
    startPageVisit(activeTabAtStartup.id, activeTabAtStartup.url);
    startAttentionSpan(activeTabAtStartup.id, activeTabAtStartup.windowId);
  }

  // Get the current set of open tabs
  // If there is a currently active tab, ignore it since we've already handled it
  // Store information about any tab that contains a webpage with a matching domain
  var tabsAtStartup = await browser.tabs.query({ windowType: "normal" });
  if (tabsAtStartup.length > 0)
    for (const tabAtStartup of tabsAtStartup)
      if((activeTabAtStartup == null) || (tabAtStartup.id != activeTabAtStartup.id))
        startPageVisit(tabAtStartup.id, tabAtStartup.url);

  // Check when the webpage contained in a tab changes, because the browser might be
  // navigating from or to a webpage with a matching domain
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Ignore changes that don't involve the URL
    if (!("url" in changeInfo))
      return;

    // If the user's attention is currently on this tab, end the attention span
    var userAttentionOnTab = checkTabAndWindowHaveAttention(tabId, tab.windowId);
    if (userAttentionOnTab)
      stopAttentionSpan(false);

    // If this is a navigation from a page with a matching domain, record the event
    stopPageVisit(tabId);

    // If this is a navigation to a page with a matching domain, record the event
    startPageVisit(tabId, changeInfo.url);

    // If the user's attention is currently on this tab, start an attention span
    if (userAttentionOnTab)
      startAttentionSpan(tabId, tab.windowId);
  });

  // Check when the user closes a tab, because the page loaded in the tab might
  // have attention and a matching domain
  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if(checkTabAndWindowHaveAttention(tabId, removeInfo.windowId))
      stopAttentionSpan(true);
    stopPageVisit(tabId);
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
    stopAttentionSpan(false);
    startAttentionSpan(activeInfo.tabId, activeInfo.windowId);
  });

  // Check when the window focus changes, because the user might be changing
  // attention from or to a tab containing a webpage with a matching domain
  // Note that we don't currently detect when the user switches to a Private
  // Browsing window, since notifications related to those windows don't fire
  // unless the extension has permission to run in private browsing mode
  browser.windows.onFocusChanged.addListener(async windowId => {

    stopAttentionSpan(false);

    // Try to learn more about the window
    // Note that this can result in an error for non-browser windows
    var windowDetails = { type: "unknown" };
    try {
      windowDetails = await browser.windows.get(windowId);
    }
    catch(error) {
    }

    // Handle if all windows have lost focus or the focused window isn't a browser window
    // Note that we're using -1 as a placeholder for an untracked tab and/or window ID
    // This isn't necessary, but it improves the readability of debugging by
    // ensuring that every attention span has a start and an end
    if((windowId == browser.windows.WINDOW_ID_NONE) || (windowDetails.type != "normal")) {
      startAttentionSpan(-1, -1);
      return;
    }

    // Handle if there isn't an active tab in the new window
    var tabInfo = await browser.tabs.query({ windowId: windowId, active: true });
    if (tabInfo.length == 0) {
      startAttentionSpan(-1, windowId);
      return;
    }

    startAttentionSpan(tabInfo[0].id, windowId);

  });

}

/* Utilities */

// Helper function that dumps the navigation study data as an object
export async function getStudyDataAsObject() {
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
  return output;
}
