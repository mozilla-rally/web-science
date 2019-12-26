/** 
 * This module provides a research abstraction over browser events related to
 * webpage loading and user attention. The abstraction consists of the following
 * events:
 *   * Page Visit Start - the browser has started to load a webpage in a tab
 *   * Page Attention Start - the user has shifted attention to a tab
 *   * Page Attention Stop - the user has shifted attention from a tab
 *   * Page Visit Stop - the browser has unloaded a webpage from a tab
 *   
 * Attention is defined as satisfying all of the following conditions:
 *   * The tab is the active tab in its browser window
 *   * The window containing the tab is the current browser window
 *   * The current browser window has focus in the operating system
 *   * (Optional) The user has provided input to the browser within the last N seconds
 *   
 * If the user's attention is on a tab and the tab closes, the sequence of events
 * will be Page Attention Stop -> Page Visit Stop. The timestamp is syncronized for
 * the events.
 *
 * If the user's attention is on a tab and the page in the tab changes, the sequence
 * of events will be Page Attention Stop -> Page Visit Stop -> Page Visit Start ->
 * Page Attention Start. The timestamp is syncronized for the events.
 *
 * The page visit and attention events are implemented in one module in order to
 * guarantee the ordering of events.
 *
 * Represented as a finite-state automaton, the research abstraction consists of
 * the following states and transitions.  
 * ```   
 *        Page Attention Start <----------------------> Page Attention Stop  
 *                  ^                                              |  
 *                  |                                              |  
 *                  |                                              V  
 *   Page Visit Start -------------------------------------------> Page Visit Stop  
 * ```   
 * Note that this module depends on the idle API, which has a couple quirks in Firefox:
 *   * There is a five-second interval when polling idle status from the operating
 *     system.
 *   * Depending on the platform, the idle API reports either time since user input to
 *     the browser or time since user input to the operating system.
 *
 * The polling interval coarsens the timing of page attention events related to idle state.
 * As long as the polling interval is relatively short in comparison to the idle threshold,
 * that should not be an issue.
 * 
 * The platform-specific meaning of idle state should also not be an issue. There is only a
 * difference between the two meanings of idle state when the user is providing input to
 * another application; if the user is providing input to the browser, or is not providing
 * input at all, the two meanings are identical. In the scenario where the user is providing
 * input to another application, the browser will lose focus in the operating system; this
 * module will detect that with the windows API and fire a page attention stop (if needed).
 * 
 * @module "WebScience.Utilities.PageEvents"
 */

import * as Idle from "./Idle.js"

/**
 * The threshold N (in seconds) for determining whether the browser has the user's attention.
 * @private
 * @constant {number}
 * @default
 */
const idleThreshold = 15;

/**
 * Whether to consider user input in determining attention state.
 * @private
 * @constant {boolean}
 * @default
 */
const considerUserInputForAttention = true;

/**
 * A listener function for page visit start events.
 * @callback pageVisitStartListener
 * @param {Object} details - Additional information about the page visit start event.
 * @param {number} details.tabId - The tab containing the page, unique to the browsing session.
 * @param {number} details.windowId - The window containing the page, unique to the browsing session.
 * Note that tabs can subsequently move between windows.
 * @param {string} details.url - The URL of the page loading in the tab.
 * @param {number} details.timeStamp - The time when the underlying browser event fired.
 */

/**
 * The set of listener functions for page visit start events.
 * @private
 * @constant {pageVisitStartListener[]}
 */
const pageVisitStartListeners = [ ];

/** 
 * Register a listener function that will be notified about page visit start events.
 * @param {pageVisitStartListener} pageVisitStartListener - The listener function. 
 * @param {boolean} [notifyAboutCurrentPages=true] - Whether the listener should be fired for the currently open set of pages.
 * @param {number} [timeStamp=Date.now()] - The time to use if the listener should be fired for the currently open set of pages.
 */
export async function registerPageVisitStartListener(pageVisitStartListener, notifyAboutCurrentPages = true, timeStamp = Date.now()) {
    initialize();
    pageVisitStartListeners.push(pageVisitStartListener);
    if(notifyAboutCurrentPages)
        notifyPageVisitStartListenerAboutCurrentPages(pageVisitStartListener, timeStamp);
}

/** 
 * Notify page visit start listeners about a page visit start event.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {number} windowId - The window containing the page, unique to the browsing session.
 * @param {string} url - The URL of the page loading in the tab.
 * @param {boolean} [notifyAboutCurrentPages=true] - Whether the listener should be fired for the currently open set of pages.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
function notifyPageVisitStartListeners(tabId, windowId, url, timeStamp = Date.now()) {
    for (const pageVisitStartListener of pageVisitStartListeners)
        pageVisitStartListener({
            tabId: tabId,
            windowId: windowId,
            url: url.repeat(1), // copy the URL string in case a listener modifies it
            timeStamp: timeStamp
        });
}

/**
 * Notify a page visit start listener about the current set of open pages. Useful for when
 * a listener is registered in the middle of a browsing session (e.g., because the extension
 * was just installed or the user just gave consent).
 * @private
 * @param {pageVisitStartListener} pageVisitStartListener - The listener.
 * @param {number} timeStamp - The time when the listener was registered.
 */
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

/**
 * A listener function for page visit stop events.
 * @callback pageVisitStopListener
 * @param {Object} details - Additional information about the page visit stop event.
 * @param {number} details.tabId - The tab containing the page, unique to the browsing session.
 * @param {number} details.windowId - The window containing the page, unique to the browsing session.
 * @param {number} details.timeStamp - The time when the underlying browser event fired.
 */

 /**
 * The set of listener functions for page visit stop events.
 * @private
 * @constant {pageVisitStopListener[]}
 */
const pageVisitStopListeners = [ ];

/** 
 * Register a listener function that will be notified about page visit stop events.
 * @param {pageVisitStopListener} pageVisitStopListener - The listener function.
 */
export function registerPageVisitStopListener(pageVisitStopListener) {
    initialize();
    pageVisitStopListeners.push(pageVisitStopListener);
}

/** 
 * Notify page visit stop listeners about a page visit stop event.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {number} windowId - The window containing the page, unique to the browsing session.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
function notifyPageVisitStopListeners(tabId, windowId, timeStamp = Date.now()) {
    for (const pageVisitStopListener of pageVisitStopListeners)
        pageVisitStopListener({
            tabId: tabId,
            windowId: windowId,
            timeStamp: timeStamp
        });
}

/**
 * A listener function for page attention start events.
 * @callback pageAttentionStartListener
 * @param {Object} details - Additional information about the page attention start event.
 * @param {number} details.tabId - The tab containing the page, unique to the browsing session.
 * @param {number} details.windowId - The window containing the page, unique to the browsing session.
 * Note that tabs can subsequently move between windows.
 * @param {number} details.timeStamp - The time when the underlying browser event fired.
 */

/**
 * The set of listener functions for page attention start events.
 * @private
 * @constant {pageAttentionStartListener[]}
 */
const pageAttentionStartListeners = [ ];

/** 
 * Register a listener function that will be notified about page attention start events.
 * @param {pageAttentionStartListener} pageAttentionStartListener - The listener function. 
 * @param {boolean} [notifyAboutCurrentPages=true] - Whether the listener should be fired
 * for the page that currently has attention (if there is one).
 * @param {number} [timeStamp=Date.now()] - The time to use if the listener should be fired
 * for the page that currently has attention (if there is one).
 */
export async function registerPageAttentionStartListener(pageAttentionStartListener, notifyAboutCurrentPageAttention = true, timeStamp = Date.now()) {
    initialize();
    pageAttentionStartListeners.push(pageAttentionStartListener);
    if(notifyAboutCurrentPageAttention)
        notifyPageAttentionStartListenerAboutCurrentPageAttention(pageAttentionStartListener, timeStamp);
}

/** 
 * Notify page attention start listeners and content scripts about a page attention start event.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {number} windowId - The window containing the page, unique to the browsing session.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
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

/**
 * Notify a page attention start listener about the currently active tab in the currently
 * focused window (if there is such a tab). Useful for when a listener is registered in the
 * middle of a browsing session (e.g., because the extension was just installed or the user
 * just gave consent).
 * @private
 * @param {pageAttentionStartListener} pageAttentionStartListener - The listener.
 * @param {number} timeStamp - The time when the listener was registered.
 */
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

/**
 * A listener function for page attention stop events.
 * @callback pageAttentionStopListener
 * @param {Object} details - Additional information about the page attention stop event.
 * @param {number} details.tabId - The tab containing the page, unique to the browsing session.
 * @param {number} details.windowId - The window containing the page, unique to the browsing session.
 * Note that tabs can subsequently move between windows.
 * @param {number} details.timeStamp - The time when the underlying browser event fired.
 */

/**
 * The set of listener functions for page attention stop events.
 * @private
 * @constant {pageAttentionStopListener[]}
 */
const pageAttentionStopListeners = [ ];

/** 
 * Register a listener function that will be notified about page attention stop events.
 * @param {pageAttentionStopListener} pageAttentionStopListener - The listener function. 
 */
export async function registerPageAttentionStopListener(pageAttentionStopListener) {
    initialize();
    pageAttentionStopListeners.push(pageAttentionStopListener);
}

/** 
 * Notify page attention stop listeners and content scripts about a page attention stop event.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {number} windowId - The window containing the page, unique to the browsing session.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
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

/**
 * Whether to notify content scripts about page attention state changes.
 * @private
 * @type {boolean}
 * @default
 */
var notifyContentScriptsAboutPageAttention = false;

/**
 * Set whether to notify content scripts about page attention state changes.
 * Content scripts will receive the message `{ type: "WebScience.pageAttentionStart" }`
 * when the page gains attention, and will receive the message `{ type: "WebScience.pageAttentionStop" }`
 * when the page loses attention. This module does not provide notifications
 * to content scripts about page visit state changes, because content scripts
 * can observe those directly and there is a possible race condition with closing a page.
 * @param {boolean} notificationSetting - Whether to notify content scripts
 * about page attention state changes.
 */
export async function setPageAttentionContentScriptMessages(notificationSetting) {
    initialize();
    notifyContentScriptsAboutPageAttention = notificationSetting;
}

/**
 * The currently active tab in the currently focused browsing window. Has the value -1
 * if there is no such tab. 
 * @private
 * @type {number}
 * @default
 */
var currentActiveTab = -1;

/**
 * The currently focused browsing window. Has the value -1 if there is no such window. 
 * @private
 * @type {number}
 * @default
 */
var currentFocusedWindow = -1;

/**
 * Whether the browser is active or idle. Ignored if the module is configured to
 * not consider user input when determining the attention state.
 * @private
 * @type {boolean}
 * @default
 */
var browserIsActive = false;

/**
 * Checks for the following conditions:
 *   * The tab is the currently active tab in the currently focused window.
 *   * The window is the currently focused window.
 *   * The browser is active (i.e., not idle), if the module is configured to
 *     consider user input in determining the attention state.
 * @private
 * @param {number} tabId - The tab to check.
 * @param {number} windowId - The window to check.
 */
function checkForAttention(tabId, windowId) {
    return ((currentActiveTab == tabId) && (currentFocusedWindow == windowId) && (considerUserInputForAttention ? browserIsActive : true));
}

/**
 * Whether the module has configured browser event handlers.
 * @private
 * @type {boolean}
 */
var initialized = false;

/**
 * Configure browser event handlers. Runs only once.
 * @private
 */
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
        await Idle.registerIdleStateListener((newState) => {
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
        }, idleThreshold);
    }

    // Remember the browser activity state, the focused window, and the active tab in that window at the time of initialization

    // Get and remember the browser activity state
    if(considerUserInputForAttention)
        browserIsActive = Idle.queryState(idleThreshold) === "active";
    
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
