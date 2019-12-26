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
 * @module WebScience.Utilities.PageEvents
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
 * @constant {Set<pageVisitStartListener>}
 */
const pageVisitStartListeners = new Set();

/** 
 * Register a listener function that will be notified about page visit start events.
 * @param {pageVisitStartListener} pageVisitStartListener - The listener function. 
 * @param {boolean} [notifyAboutCurrentPages=true] - Whether the listener should be fired for the currently open set of pages.
 * @param {number} [timeStamp=Date.now()] - The time to use if the listener should be fired for the currently open set of pages.
 */
export async function registerPageVisitStartListener(pageVisitStartListener, notifyAboutCurrentPages = true, timeStamp = Date.now()) {
    initialize();
    pageVisitStartListeners.add(pageVisitStartListener);
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
 * @constant {Set<pageVisitStopListener>}
 */
const pageVisitStopListeners = new Set();

/** 
 * Register a listener function that will be notified about page visit stop events.
 * @param {pageVisitStopListener} pageVisitStopListener - The listener function.
 */
export function registerPageVisitStopListener(pageVisitStopListener) {
    initialize();
    pageVisitStopListeners.add(pageVisitStopListener);
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
 * @constant {Set<pageAttentionStartListener>}
 */
const pageAttentionStartListeners = new Set();

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
    pageAttentionStartListeners.add(pageAttentionStartListener);
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
 * @constant {Set<pageAttentionStopListener>}
 */
const pageAttentionStopListeners = new Set();

/** 
 * Register a listener function that will be notified about page attention stop events.
 * @param {pageAttentionStopListener} pageAttentionStopListener - The listener function. 
 */
export async function registerPageAttentionStopListener(pageAttentionStopListener) {
    initialize();
    pageAttentionStopListeners.add(pageAttentionStopListener);
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
 * @typedef {Object} WindowDetails
 * @property {string} type - The type of window. This string has the same
 * values as `windows.WindowType`.
 * @property {number} activeTab - The ID of the active tab in the window,
 * or -1 if there is no active tab.
 * @property {boolean} privacy - Whether the window is a private window. Values
 * are `"normal"` for a non-private window, `"private"` for a private window,
 * and `"unknown"` if the window's privacy status is unknown.
 */

/**
 * A Map that tracks the current state of browser windows. We need this cached
 * state to avoid asynchronous queries when the focused window changes.
 * @private
 * @const {Map<number,WindowDetails>}
 * @default
 */
const windowState = new Map();

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
 * Whether the module is in the process of configuring browser event handlers
 * and caching initial state.
 * @private
 * @type {boolean}
 */
var initializing = false;

/**
 * Whether the module has started configuring browser event handlers and caching
 * initial state.
 * @private
 * @type {boolean}
 */
var initialized = false;

/**
 * Configure browser event handlers and cache initial state. Runs only once.
 * @private
 */
async function initialize() {
    if(initialized || initializing)
        return;
    initializing = true;

    // Configure event listeners
    // Note that we have to call Idle.registerIdleStateListener before we call
    // Idle.queryState, so this comes before caching the initial state

    // Handle when the webpage in a tab changes
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if(!initialized)
            return;
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
        if(!initialized)
            return;
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
        if(!initialized)
            return;
        var timeStamp = Date.now();

        // Save the active tab in the cached window state
        // Note that we might receive the tabs.onActivated
        // event before the windows.onCreated event for a new
        // window, in which case we should create state for
        // the window with other properties "unknown"
        var activeTabWindowDetails = windowState.get(activeInfo.windowId);
        if(activeTabWindowDetails === undefined) {
            activeTabWindowDetails = {
                type: "unknown",
                privacy: "unknown"
            };
            windowState.set(activeInfo.windowId, activeTabWindowDetails);
        }
        activeTabWindowDetails.activeTab = activeInfo.tabId;

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

    // Handle when a window is created
    browser.windows.onCreated.addListener(createdWindow => {
        if(!initialized)
            return;
        
        // If the window doesn't have a window ID, ignore it
        // This shouldn't happen, but checking anyway since
        // the id property is optional in the windows.Window
        // type
        if(!("id" in createdWindow))
            return;

        // Check whether there is already state cached for this window
        // and, if there is, copy the active tab ID
        // This handles the scenario where tabs.onActivated fires before
        // windows.onCreated fires for a tab in a new window
        var activeTabInCreatedWindow = -1;
        var createdWindowDetails = windowState.get(createdWindow.id);
        if(createdWindowDetails !== undefined)
            activeTabInCreatedWindow = createdWindowDetails.activeTab;

        // Save the created window in the cached window state
        windowState.set(createdWindow.id, {
            type: "type" in createdWindow ? createdWindow.type : "unknown",
            activeTab: activeTabInCreatedWindow,
            privacy: createdWindow.incognito ? "private" : "normal"
        });
    });

    // Handle when a window is removed
    browser.windows.onRemoved.addListener(windowId => {
        if(!initialized)
            return;
        
        // If we have cached state for this window, drop it
        if(windowState.has(windowId))
            windowState.delete(windowId);
    });

    // Handle when the focused window changes
    browser.windows.onFocusChanged.addListener(windowId => {
        if(!initialized)
            return;
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

        // Get information about the focused window from the cached window state
        var focusedWindowDetails = windowState.get(windowId);

        // If we haven't seen this window before, assume that it's not a browser window,
        // remember tab ID = -1 and window ID -1, and do not start a new attention span
        // This situation can come up with unusual browser windows, which do not seem to
        // consistently appear in the set of windows from browser.windows.getAll
        if(focusedWindowDetails === undefined) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }

        // If the new window is not a browser window, remember tab ID = -1 and window ID = -1,
        // and do not start a new attention span
        if(((focusedWindowDetails.type != "normal") && (focusedWindowDetails.type != "popup"))) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }

        // Otherwise, remember the new active tab and focused window, and if the browser is active
        // or (optionally) we are not considering user input, start a new attention span
        currentActiveTab = focusedWindowDetails.activeTab;
        currentFocusedWindow = windowId;
        if(browserIsActive || !considerUserInputForAttention)
            notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, timeStamp);
    });
    
    // Handle when the browser activity state changes
    // This listener abstracts the browser activity state into two categories: active and inactive
    // Active means the user has recently provided input to the browser, inactive means any other
    // state (regardless of whether a screensaver or lock screen is enabled)
    if(considerUserInputForAttention) {
        await Idle.registerIdleStateListener(newState => {
            if(!initialized)
                return;
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

    // Get and remember the browser idle state
    if(considerUserInputForAttention)
        browserIsActive = (Idle.queryState(idleThreshold) === "active");
    
    // Get and remember the browser window state
    var openWindows = await browser.windows.getAll({
        populate: true,
        windowTypes: [ "normal", "popup", "panel", "devtools" ]
    });
    for(const openWindow of openWindows) {
        // If the window doesn't have a window ID, ignore it
        // This shouldn't happen, but checking anyway since
        // the id property is optional in the windows.Window
        // type
        if(!("id" in openWindow))
            continue;
        // Iterate the tabs in the window to find the active tab
        // (if there is one), otherwise save active tab ID = -1
        // for the window
        var activeTabInOpenWindow = -1;
        if("tabs" in openWindow)
            for(const tab of openWindow.tabs)
                if(tab.active)
                    activeTabInOpenWindow = tab.id;
        windowState.set(openWindow.id, {
            type: openWindow.type,
            activeTab: activeTabInOpenWindow,
            privacy: openWindow.incognito ? "private" : "normal"
        });

        // If this is the focused window and it is a normal or popup
        // window, remember the window ID and active tab ID (if any)
        // If there is no focused window, or the focused window isn't
        // a normal or popup window, this block will not run and we
        // will retain the default values of tab ID = -1 and window
        // ID = -1
        if((openWindow.focused) && ((openWindow.type === "normal") || (openWindow.type === "popup"))) {
            currentFocusedWindow = openWindow.id;
            currentActiveTab = activeTabInOpenWindow;
        }
    }

    initializing = false;
    initialized = true;
}
