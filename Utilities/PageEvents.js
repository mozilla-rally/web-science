/*  This module provides a research abstraction over browser events related to
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
        * (Optional) The user has provided input to the browser within the last N seconds
    
    If the user's attention is on a tab and the tab closes, the sequence of events
    will be Page Attention Stop -> Page Visit Stop. The timestamp is syncronized for
    the events.

    If the user's attention is on a tab and the page in the tab changes, the sequence
    of events will be Page Attention Stop -> Page Visit Stop -> Page Visit Start ->
    Page Attention Start. The timestamp is syncronized for the events.

    The page visit and attention events are implemented in one module in order to
    guarantee the ordering of events.

    Represented as a finite-state automaton, the research abstraction consists of
    the following states and transitions.
            
           Page Attention Start <----------------------> Page Attention Stop
                   ^                                              |
                   |                                              |
                   |                                              V
    Page Visit Start -------------------------------------------> Page Visit Stop 
    
    WARNING: Firefox can take several seconds after user input before transitioning
    from inactive to active state based on user input. This introduces measurement
    error. */

// The threshold N (in seconds) for determining whether the browser has the user's attention
const idleThreshold = 15;
browser.idle.setDetectionInterval(idleThreshold);

// Whether to consider user input in determining attention state
const considerUserInputForAttention = true;

/*  Support for registering and notifying listeners on page visit start.
    The listener receives a details object with the following properties:
        * tabId - the tab containing the page, unique to the browsing session
        * windowId - the window containing the page, unique to the browsing session,
                     note that tabs can subsequently move between windows
        * url - the URL of the page loading in the tab
        * timeStamp - the time when the underlying browser event fired */

var pageVisitStartListeners = [ ];

export async function registerPageVisitStartListener(pageVisitStartListener, notifyAboutCurrentPages = true, timeStamp = Date.now()) {
    initialize();
    pageVisitStartListeners.push(pageVisitStartListener);
    if(notifyAboutCurrentPages)
        notifyPageVisitStartListenerAboutCurrentPages(pageVisitStartListener, timeStamp);
}

export function notifyPageVisitStartListeners(tabId, windowId, url, timeStamp = Date.now()) {
    for (const pageVisitStartListener of pageVisitStartListeners)
        pageVisitStartListener({
            tabId: tabId,
            windowId: windowId,
            url: url.repeat(1), // copy the URL string in case a listener modifies it
            timeStamp: timeStamp
        });
}

/*  Support for registering and notifying listeners on page visit stop.
    The listener receives a details object with the following properties:
        * tabId - the tab containing the page, unique to the browsing session
        * windowId - the window containing the page, unique to the browsing session,
                     note that this window may differ from the window that contained
                     the tab when the page visit start event fired
        * timeStamp - the time when the underlying browser event fired */

var pageVisitStopListeners = [ ];

export function registerPageVisitStopListener(pageVisitStopListener) {
    initialize();
    pageVisitStopListeners.push(pageVisitStopListener);
}

function notifyPageVisitStopListeners(tabId, windowId, timeStamp = Date.now()) {
    for (const pageVisitStopListener of pageVisitStopListeners)
        pageVisitStopListener({
            tabId: tabId,
            windowId: windowId,
            timeStamp: timeStamp
        });
}

/*  Support for registering and notifying listeners on page attention start.
    The listener receives a details object with the following properties:
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

function notifyPageAttentionStartListeners(tabId, windowId, timeStamp = Date.now()) {
    for (const pageAttentionStartListener of pageAttentionStartListeners)
        pageAttentionStartListener({
            tabId: tabId,
            windowId: windowId,
            timeStamp: timeStamp
        });
    if(notifyContentScriptsAboutPageAttention)
        browser.tabs.sendMessage(tabId, { type: "WebScience.pageAttentionStart" });
}

/*  Support for registering and notifying listeners on page attention stop.
    The listener receives a details object with the following properties:
        * tabId - the tab losing attention, unique to the browsing session
        * windowId - the window containing the tab, unique to the browsing
                     session, note that tabs can subsequently move between windows
        * timeStamp - the time when the underlying browser event fired */

var pageAttentionStopListeners = [ ];

export async function registerPageAttentionStopListener(pageAttentionStopListener) {
    initialize();
    pageAttentionStopListeners.push(pageAttentionStopListener);
}

function notifyPageAttentionStopListeners(tabId, windowId, timeStamp = Date.now()) {
    for (const pageAttentionStopListener of pageAttentionStopListeners)
        pageAttentionStopListener({
            tabId: tabId,
            windowId: windowId,
            timeStamp: timeStamp
        });
    if(notifyContentScriptsAboutPageAttention)
        browser.tabs.sendMessage(tabId, { type: "WebScience.pageAttentionStop" });
}

/* Support for notifying content scripts when page attention state changes.
   We don't need to notify content scripts about page visit state changes,
   since content scripts can observe those directly and there are possible
   race condition oddities. */
var notifyContentScriptsAboutPageAttention = false;
export async function setPageAttentionContentScriptMessages(notificationSetting) {
    initialize();
    notifyContentScriptsAboutPageAttention = notificationSetting;
}

// Keep track of the current focused window, the current active tab, and the current
// browser activity state

var currentActiveTab = -1;
var currentFocusedWindow = -1;
var browserIsActive = false;

export function checkForAttention(tabId, windowId) {
    return ((currentActiveTab == tabId) && (currentFocusedWindow == windowId) && (considerUserInputForAttention ? browserIsActive : true));
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

        // Ignore changes that do not involve the URL
        if (!("url" in changeInfo))
            return;

        // If this is the active tab and focused window, and (optionally) the browser is active, end the attention span
        var hasAttention = checkForAttention(tabId, tab.windowId);
        if (hasAttention) {
            notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);
        }

        // End the page visit
        notifyPageVisitStopListeners(tabId, tab.windowId, timeStamp);
        
        // Start the page visit
        notifyPageVisitStartListeners(tabId, tab.windowId, changeInfo.url, timeStamp);

        // If this is the active tab and focused window, and (optionally) the browser is active, start an attention span
        if (hasAttention)
            notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, timeStamp);
    });

    // Handle when a tab closes
    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
        var timeStamp = Date.now();

        // If this is the active tab and focused window, and (optionally) the browser is active, end the attention span
        if(checkForAttention(tabId, removeInfo.windowId)) {
            notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);
        }
        
        // If this is the active tab, forget it
        if(currentActiveTab == tabId)
            currentActiveTab = -1;

        // End the page visit
        notifyPageVisitStopListeners(tabId, removeInfo.windowId, timeStamp);
    });

    // Handle when the active tab in a window changes
    browser.tabs.onActivated.addListener(activeInfo => {
        var timeStamp = Date.now();

        // If this is a non-browser tab, ignore it
        if(activeInfo.tabId == browser.tabs.TAB_ID_NONE)
            return;
        
        // If there isn't a focused window, or the tab update is not in the focused window, ignore it
        if((currentFocusedWindow < 0) || (activeInfo.windowId != currentFocusedWindow))
            return;

        // If the browser is active or (optionally) we are not considering user input,
        // first end the attention span if there is an active tab in the focused window,
        // then start a new attention span
        if((browserIsActive || !considerUserInputForAttention)) {
            if((currentActiveTab >= 0) && (currentFocusedWindow >= 0))
                notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);
            notifyPageAttentionStartListeners(activeInfo.tabId, currentFocusedWindow, timeStamp);
        }
        
        // Remember the new active tab
        currentActiveTab = activeInfo.tabId;
    });

    // Handle when the focused window changes
    browser.windows.onFocusChanged.addListener(async windowId => {
        var timeStamp = Date.now();

        // If the browser is active or (optionally) we are not considering user input, and if
        // if there is an active tab in a focused window, end the attention span
        if((browserIsActive || !considerUserInputForAttention) && ((currentActiveTab >= 0) && (currentFocusedWindow >= 0))) {
            notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);
        }

        // If the browser has lost focus in the operating system, remember 
        // tab ID = -1 and window ID = -1, and do not start a new attention span
        // Note that this check should happen before the browser.windows.get await below,
        // because quick sequential events can cause the browser.windows.onFocusChanged
        // listener to run again before the await resolves and trigger errors if currentActiveTab
        // and currentFocusedWindow are not set properly
        if (windowId == browser.windows.WINDOW_ID_NONE) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }

        // Try to learn more about the new window
        // Note that this can result in an error for non-browser windows
        var windowDetails = { type: "unknown" };
        try {
            windowDetails = await browser.windows.get(windowId);
        }
        catch(error) {
        }

        // If the new window is not a browser window, remember tab ID = -1 and window ID = -1,
        // and do not start a new attention span
        if(((windowDetails.type != "normal") && (windowDetails.type != "popup"))) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }

        // If there is not an active tab in the new window, remember tab ID = -1 and the new
        // focused window, and do not start a new attention span
        var tabInfo = await browser.tabs.query({ windowId: windowId, active: true });
        if (tabInfo.length == 0) {
            currentActiveTab = -1;
            currentFocusedWindow = windowId;
            return;
        }

        // Otherwise, remember the new active tab and focused window, and if the browser is active
        // or (optionally) we are not considering user input, start a new attention span
        currentActiveTab = tabInfo[0].id;
        currentFocusedWindow = windowId;
        if(browserIsActive || !considerUserInputForAttention)
            notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, timeStamp);
    });
    
    // Handle when the browser activity state changes
    // This listener abstracts the browser activity state into two categories: active and inactive
    // Active means the user has recently provided input to the browser, inactive means any other
    // state (regardless of whether a screensaver or lock screen is enabled)
    if(considerUserInputForAttention) {
        browser.idle.onStateChanged.addListener((newState) => {
            var timeStamp = Date.now();

            // If the browser is not transitioning between active and inactive states, ignore the event
            if((browserIsActive) == (newState == "active"))
                return;
            
            // Remember the flipped browser activity state
            browserIsActive = !browserIsActive;

            // If there is an active tab in a focused window, send an attention start event (if the
            // browser is transitioning to active) or an attention stop event (if the browser is
            // transitioning to inactive)
            if((currentActiveTab >= 0) && (currentFocusedWindow >= 0)) {
                if(browserIsActive)
                    notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, timeStamp);
                else {
                    notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, timeStamp);
                }
            }
        });
    }

    // Remember the browser activity state, the focused window, and the active tab in that window at the time of initialization

    // Get and remember the browser activity state
    browserIsActive = ((await browser.idle.queryState(idleThreshold)) == "active");
    
    // Get the most recently focused window and the tabs in that window
    var lastFocusedWindow = null;
    try {
        lastFocusedWindow = await browser.windows.getLastFocused({
            populate: true,
        });
    }
    catch(error) {
    }

    // If there was an error or there is no most recently focused window, keep the default
    // values of tab ID = -1 and window ID = -1
    if(lastFocusedWindow == null)
        return;
    
    // If the most recently focused window cannot contain a webpage, keep the default values
    // of tab ID = -1 and window ID = -1
    if((lastFocusedWindow.type != "normal") && (lastFocusedWindow.type != "popup"))
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
        windowType: "normal",
        url: [ "http://*/*", "https://*/*" ]
    });
    currentTabs = currentTabs.concat(await browser.tabs.query({
        windowType: "popup",
        url: [ "http://*/*", "https://*/*" ]
    }));

    // Notify the listener
    if (currentTabs.length > 0)
        for (const currentTab of currentTabs)
            pageVisitStartListener({
                tabId: currentTab.id,
                windowId: currentTab.windowId,
                url: currentTab.url.repeat(1), // copy the URL string in case a listener modifies it
                timeStamp: timeStamp
            });
}

// Notifies a listener about the current page with attention, useful for when the extension
// launches in the middle of a browsing session
async function notifyPageAttentionStartListenerAboutCurrentPageAttention(pageAttentionStartListener, timeStamp) {
    // If there is no active tab or no focused window, there is no notification to provide
    if((currentActiveTab < 0) || (currentFocusedWindow < 0))
        return;

    // If the module should consider user input and the browser is inactive, there is no notification to provide
    if(considerUserInputForAttention && !browserIsActive)
        return;

    // Otherwise, notify the listener
    pageAttentionStartListener({
        tabId: currentActiveTab,
        windowId: currentFocusedWindow,
        timeStamp: timeStamp
    });
}
