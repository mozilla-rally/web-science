/*  This module provides a research abstraction over extension events related to
    webpage loading and user attention. The abstraction consists of the following
    events:
        * Page Visit Start - the browser has started to load a webpage in a tab
        * Page Attention Start - the user has shifted attention to a tab
        * Page Attention Stop - the user has shifted attention from a tab
        * Page Visit Stop - the browser has unloaded a webpage from a tab
    
    Attention is defined as satisfying all of the following conditions:
        * The tab is the active tab in its browser window
        * The window containing the tab is the current browser window
        * The current browser window has focus in the operating system
    
    If the user's attention is on a tab and the tab closes, the sequence of events
    will be Page Attention Stop -> Page Visit Stop. The timestamp is syncronized for
    the events.

    If the user's attention is on a tab and the page in the tab changes, the sequence
    of events will be Page Attention Stop -> Page Visit Stop -> Page Visit Start ->
    Page Attention Start. The timestamp is syncronized for the events.

    The page visit and attention events are implemented in one module in order to
    guarantee the ordering of events. */

/*  Support for registering and notifying listeners on page visit start.
    The listener receives the following parameters:
        * tabId - the tab containing the page, unique to the browsing session
        * windowId - the window containing the page, unique to the browsing session,
                     note that tabs can subsequently move between windows
        * url - the URL of the page loading in the tab */

var pageVisitStartListeners = [ ];

export async function registerPageVisitStartListener(pageVisitStartListener, notifyAboutCurrentPages = true, timeStamp = Date.now()) {
    initialize();
    pageVisitStartListeners.push(pageVisitStartListener);
    if(notifyAboutCurrentPages)
        notifyPageVisitStartListenerAboutCurrentPages(pageVisitStartListener, timeStamp);
}

function notifyPageVisitStartListeners(tabId, windowId, url) {
    for (const pageVisitStartListener of pageVisitStartListeners)
        pageVisitStartListener(tabId, windowId, url);
}

/*  Support for registering and notifying listeners on page visit stop.
    The listener receives the following parameters:
        * tabId - the tab containing the page, unique to the browsing session
        * windowId - the window containing the page, unique to the browsing session,
                     note that this window may differ from the window that contained
                     the tab when the page visit start event fired */

var pageVisitStopListeners = [ ];

export function registerPageVisitStopListener(pageVisitStopListener) {
    initialize();
    pageVisitStopListeners.push(pageVisitStopListener);
}

function notifyPageVisitStopListeners(tabId, windowId) {
    for (const pageVisitStopListener of pageVisitStopListeners)
        pageVisitStopListener(tabId, windowId);
}

/*  Support for registering and notifying listeners on page attention start.
    The listener receives the following parameters:
        * tabId - the tab gaining attention, unique to the browsing session
        * windowId - the window containing the tab, unique to the browsing
                     session, note that tabs can subsequently move between windows
        * timeStamp - the time when the underlying browser event fired */

var pageAttentionStartListeners = [ ];

export async function registerPageAttentionStartListener(pageAttentionStartListener, notifyAboutCurrentPageAttention = true, timeStamp = Date.now()) {
    initialize();
    pageAttentionStartListeners.push(pageAttentionStartListener);
    if(notifyAboutCurrentPageAttention)
        notifyPageAttentionStartListenerAboutCurrentPageAttention(pageAttentionStartListener, timeStamp);
}

function notifyPageAttentionStartListeners(tabId, windowId, timeStamp) {
    for (const pageAttentionStartListener of pageAttentionStartListeners)
        pageAttentionStartListener(tabId, windowId, timeStamp);
}

/*  Support for registering and notifying listeners on page attention stop.
    The listener receives the following parameters:
        * tabId - the tab losing attention, unique to the browsing session
        * windowId - the window containing the tab, unique to the browsing
                     session, note that tabs can subsequently move between windows
        * timeStamp - the time when the underlying browser event fired */

var pageAttentionStopListeners = [ ];

export async function registerPageAttentionStopListener(pageAttentionStopListener) {
    initialize();
    pageAttentionStopListeners.push(pageAttentionStopListener);
}

function notifypageAttentionStopListeners(tabId, windowId, timeStamp) {
    for (const pageAttentionStopListener of pageAttentionStopListeners)
        pageAttentionStopListener(tabId, windowId, timeStamp);
}

// Keep track of the current focused window and active tab, and functions
// for checking against those values

var currentActiveTab = -1;
var currentFocusedWindow = -1;

export function checkTabAndWindowHaveAttention(tabId, windowId) {
    return ((currentActiveTab == tabId) && (currentFocusedWindow == windowId));
}

export function checkWindowHasAttention(windowId) {
    return (currentFocusedWindow == windowId);
}

// First run function that sets up browser event handlers

var initialized = false;

async function initialize() {
    if(initialized)
        return;
    initialized = true;

    // Handle when the webpage in a tab changes
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        var timeStamp = Date.now();

        // Ignore changes that don't involve the URL
        if (!("url" in changeInfo))
            return;

        // If the user's attention is on this tab and window, end the attention span
        var userAttentionOnTabAndWindow = checkTabAndWindowHaveAttention(tabId, tab.windowId);
        if (userAttentionOnTabAndWindow)
            notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);

        // End the page visit
        notifyPageVisitStopListeners(tabId, tab.windowId, timeStamp);
        
        // Start the page visit
        notifyPageVisitStartListeners(tabId, tab.windowId, changeInfo.url, timeStamp);

        // If the user's attention is on this tab and window, start an attention span
        if (userAttentionOnTabAndWindow)
            notifyPageAttentionStartListeners(currentActiveTab, tab.currentFocusedWindow, timeStamp);
    });

    // Handle when a tab closes
    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
        var timeStamp = Date.now();

        // If the user's attention is on this tab and window, end the attention span
        // and forget the current active tab
        if(checkTabAndWindowHaveAttention(tabId, removeInfo.windowId)) {
            notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);
            currentActiveTab = -1;
        }

        // End the page visit
        notifyPageVisitStopListeners(tabId, removeInfo.windowId, timeStamp);
    });

    // Handle when the active tab in a window changes
    browser.tabs.onActivated.addListener(activeInfo => {
        var timeStamp = Date.now();

        // If this is a non-browser tab, ignore it
        if(activeInfo.tabId == browser.tabs.TAB_ID_NONE)
            return;
    
        // If the tab update is not in the focused window, ignore it
        if(!checkWindowHasAttention(activeInfo.windowId))
            return;
    
        // Otherwise, stop the current attention span, remember the new active tab, and
        // start a new attention span
        notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);
        currentActiveTab = activeInfo.tabId;
        notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, timeStamp);
    });

    // Handle when the focused window changes
    browser.windows.onFocusChanged.addListener(async windowId => {
        var timeStamp = Date.now();

        // End the attention span
        notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);
    
        // Try to learn more about the new window
        // Note that this can result in an error for non-browser windows
        var windowDetails = { type: "unknown" };
        try {
            windowDetails = await browser.windows.get(windowId);
        }
        catch(error) {
        }
    
        // If the browser has lost focus in the operating system, or if the new window is not
        // a browser window, remember tab ID = -1 and window ID = -1, and do not start a new
        // attention span
        if((windowId == browser.windows.WINDOW_ID_NONE) || ((windowDetails.type != "normal") && (windowDetails.type != "popup"))) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }
    
        // If there is not an active tab in the new window, remember tab ID = -1 and the new
        // focused window, and do not start a new attention span
        var tabInfo = await browser.tabs.query({ windowId: windowId, active: true });
        if (tabInfo.length == 0) {
            currentActiveTab = -1;
          return;
        }
    
        // Otherwise, remember the new active tab and focused window, and start a new attention span
        currentActiveTab = tabInfo[0].id;
        currentFocusedWindow = windowId;
        notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, timeStamp);
    });

    // Remember the focused window and active tab in that window at the time of initialization
    
    // Get the most recently focused window and the tabs in that window
    var lastFocusedWindow = null;
    try {
        lastFocusedWindow = await browser.windows.getLastFocused({
            populate: true,
            windowTypes: [ "normal", "popup" ]
        });
    }
    catch(error) {
    }

    // If there was an error or there is no most recently focused window, keep the default
    // values of tab ID = -1 and window ID = -1
    if(lastFocusedWindow == null)
        return;
    
    // If the most recently focused window does not have focus (i.e., there is no window with
    // focus because the browser does not have focus in the operating system), keep the default
    // values of tab ID = -1 and window ID = -1
    if(!lastFocusedWindow.focused)
        return;

    // Otherwise remember the window with focus
    currentFocusedWindow = lastFocusedWindow.id;

    // If there is an active tab in the focused window, remember it, otherwise keep the default
    // value of tab ID = -1
    for(const tab in lastFocusedWindow.tabs) {
        if(tab.active) {
            currentActiveTab = tab.id;
            return;
        }
    }
}

// Notifies a listener about the current set of open pages, useful for when the extension
// launches in the middle of a browsing session

async function notifyPageVisitStartListenerAboutCurrentPages(pageVisitStartListener, timeStamp) {

    // Get the current set of open tabs
    // We have to separately get tabs in normal windows and in popup windows
    var currentTabs = await browser.tabs.query({
        windowType: "normal"
    });
    currentTabs = currentTabs.concat(await browser.tabs.query({
        windowType: "popup"
    }));

    // Notify the listener
    if (currentTabs.length > 0)
        for (const currentTab of currentTabs)
            pageVisitStartListener(currentTab.id, currentTab.windowId, currentTab.url, timeStamp);

}

// Notifies a listener about the current page with attention, useful for when the extension
// launches in the middle of a browsing session

async function notifyPageAttentionStartListenerAboutCurrentPageAttention(pageAttentionStartListener, timeStamp) {

    // Get the active tab in the  open tabs
    var activeTabInCurrentWindow = await browser.tabs.query({
        windowId: browser.windows.WINDOW_ID_CURRENT,
        active: true,
        windowType: "normal",
        url: [ "http://*/*", "https://*/*" ]
    });

    // Notify the listener
    if (activeTabInCurrentWindow.length > 0)
        pageAttentionStartListener(activeTabInCurrentWindow[0].id, activeTabInCurrentWindow[0].windowId, timeStamp);

}
