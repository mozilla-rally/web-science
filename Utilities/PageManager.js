/** 
 * # Overview
 * This module addresses several challenges for studying user engagement with web content.
 *   * __Syncing Measurements and Interventions.__ A study that uses `WebScience` will
 *     often involve multiple measurements or interventions on a webpage. The
 *     `PageManager` module enables studies to sync these measurements and interventions
 *     by assigning a random unique identifier to each webpage.
 *   * __Generating Page Lifecycle Events.__ Measurements and interventions are often
 *     linked to specific events in the webpage lifecyle. The `PageManager` module
 *     standardizes a set of webpage lifecycle events.
 *   * __Tracking User Attention.__ Measurements and interventions often depend on user
 *     attention to web content. The `PageManager` module provides a standardized
 *     attention model that incorporates tab switching, window switching, application
 *     switching, locked screens, and user mouse and keyboard input.
 *   * __Generating Audio Events.__ This module provides events for webpage audio,
 *     enabling measurements and interventions based on media playback.
 *   * __Bridging the Background and Content Script Environments.__ WebExtensions
 *     includes two distinct execution environments: background scripts and content
 *     scripts. These execution environments are, unfortunately, only loosely bound
 *     together by tab IDs. As a result, there can be race conditions---the background
 *     and content environments can have mismatched states, such that messages arrive
 *     at the wrong webpage or are attributed to the wrong webpage. This module
 *     provides provides page lifecycle, user attention, and audio events that are
 *     bound to specific webpages.
 * 
 * # Pages
 * This module creates an abstraction over webpages as perceived by users (i.e., when
 * content loads with a new HTTP(S) URL in the browser bar or the page visibly reloads).
 * Note that the History API enables web content to modify the URL without loading a new
 * HTML document via HTTP(S) or creating a new Document object. This module treats
 * a URL change via the History API as equivalent to traditional webpage navigation,
 * because (by design) it appears identical to the user. Accounting for the History
 * API is important, because it is used on some exceptionally popular websites (e.g.,
 * YouTube).
 *  
 * # Page IDs
 * Each page ID is 128-bit value, randomly generated with the Web Crypto API and
 * stored as a hexadecimal `String`. While this representation is less efficient than
 * a `Uint8Array` or similar, it is more convenient for development and debugging. The
 * page ID is available in the content script environment.
 *  
 * # Page Lifecycle
 * Each webpage has the following lifecycle events, which fire in both the background
 * page and content script environments.
 *   * Page Visit Start - The browser has started to load a webpage in a tab. This
 *     event is fired early in context script execution (i.e., soon after
 *     `document_start`). For a webpage with a new Document, the event is
 *     timestamped with the time the `window` object was created (the time origin
 *     from the High Resolution Time Level 2 API, in ms). For a webpage that does not
 *     have a new Document (i.e., resulting from the History API), the event is
 *     timestamped with the URL change in the Tabs API.
 *   * Page Visit Stop - The browser is unloading the webpage. Ordinarily this
 *     event fires and is timestamped with the `window` unload event. When the page
 *     changes via the History API, this event fires and is timestamped with the URL
 *     change in the Tabs API.
 *
 * # Attention Tracking
 * Attention to a page is defined as satisfying all of the following conditions.
 *   * The tab is the active tab in its browser window.
 *   * The window containing the tab is the current browser window.
 *   * The current browser window has focus in the operating system.
 *   * The operating system is not displaying a lock screen or screen saver.
 *   * Optional: The user has provided mouse or keyboard input within a specified time
 *     interval.
 *  
 * In the content script environment, each page has an attention status, and an event
 * fires when that status changes. Attention update events are timestamped with events
 * from the WebExtensions tabs, windows, and idle APIs.
 * 
 * # Audio Events
 * In the content script environment, each page has an audio status, and an event fires
 * when that status changes. Audio update events fire and are timestamped with events
 * from the WebExtensions tabs API.
 * 
 * # Event Ordering 
 * This module guarantees the ordering of page lifecycle, attention, and audio events.
 *   * Page visit start and page visit stop only fire once for each page, in that order.
 *   * Page attention and audio update events will only occur between page visit start
 *     and stop events.
 * 
 * # Additional Implementation Notes
 * This module depends on the `idle` API, which has a couple quirks in Firefox:
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
 * Some implementation quirks to be aware of for future development on this module:
 *   * Non-browser windows do not appear in the results of `windows.getAll()`, and calling
 *     `windows.get()` on a non-browser window throws an error. Switching focus to a non-
 *     browser window will, however, fire the `windows.onFocusChanged` event. The module
 *     assumes that if `windows.onFocusChanged` fires with an unknown window, that window
 *     is a non-browser window.
 *   * The module assumes that valid tab IDs and window IDs are always >= 0.
 * 
 * # Known Issues
 *   * When a page loads in a tab that has attention, that tab does not consistently receive
 *     an attention update message. The issue is that the background page sends an attention
 *     status message before the content script is ready to receive the message. We can
 *     address this issue by having the content script request the current page status from
 *     the background page.
 *   * There is remaining legacy `PageEvents` code to refactor and remove in the background
 *     page component of the module.
 * 
 * # Possible Improvements
 *   * Rebuild a page attention update event in the background page environment.
 *   * Rebuild the capability to fire events for pages that are already open when the module
 *     loads.
 *   * Add logic to handle the situation where the content script execution environment crashes,
 *     so the page visit stop message doesn't fire from the associated content script. 
 *   * Add an event in the content script for detecting when content has lazily loaded into the
 *     DOM after the various DOM loading events (e.g., on Twitter).
 * @module WebScience.Utilities.PageManager
 */

import * as Debugging from "./Debugging.js"
import * as Events from "./Events.js"
import * as Idle from "./Idle.js"
import * as Messaging from "./Messaging.js"

const debugLog = Debugging.getDebuggingLog("Utilities.PageManager");

/**
 * The threshold (in seconds) for determining whether the browser has the user's attention,
 * based on mouse and keyboard input.
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
 * Additional information about a page visit start event.
 * @typedef {Object} PageVisitStartDetails
 * @param {number} pageId - The ID for the page, unique across browsing sessions.
 * @param {number} tabId - The ID for the tab containing the page, unique to the browsing session.
 * @param {number} windowId - The ID for the window containing the page, unique to the browsing session.
 * Note that tabs can subsequently move between windows.
 * @param {string} url - The URL of the page loading in the tab, without any hash.
 * @param {string} referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @param {number} pageVisitStartTime - The time when the underlying event fired.
 * @param {boolean} privateWindow - Whether the page is in a private window.
 */

/**
 * A listener function for page visit start events.
 * @callback pageVisitStartListener
 * @param {PageVisitStartDetails} details - Additional information about the page visit start event.
 */

/**
 * Additional information about a page visit start event listener function.
 * @typedef {Object} PageVisitStartListenerDetails
 * @property {boolean} privateWindows - Whether to notify the listener function for events in private windows.
 */

/**
 * An event that is fired when a page visit starts.
 * @type {Events.Event}
 * @const
 */
export const onPageVisitStart = new Events.Event({
    // Filter notifications for events in private windows
    pageVisitStartCallback: ([ details ], listenerOptions) => {
        if(!details.privateWindow || (("privateWindows" in listenerOptions) && listenerOptions.privateWindows))
            return true;
        return false;
    }
});

/**
 * Notify listeners for the page visit start event.
 * @param {PageVisitStartDetails} details - Additional information about the page visit start event.
 * @private
 */
function pageVisitStart(details) {
    onPageVisitStart.notifyListeners([ details ]);
}

/**
 * Additional information about a page visit stop event.
 * @typedef {Object} PageVisitStopDetails
 * @param {number} pageId - The ID for the page, unique across browsing sessions.
 * @param {string} url - The URL of the page loading in the tab, without any hash.
 * @param {string} referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @param {number} pageVisitStartTime - The time when the page visit started.
 * @param {number} pageVisitStopTime - The time when the underlying event fired.
 * @param {boolean} privateWindow - Whether the page is in a private window.
 */

/**
 * A listener function for page visit stop events.
 * @callback pageVisitStopListener
 * @param {PageVisitStopDetails} details - Additional information about the page visit stop event.
 */

/**
 * Additional information about a page visit start stop listener function.
 * @typedef {Object} PageVisitStopListenerDetails
 * @property {boolean} privateWindows - Whether to notify the listener function for events in private windows.
 */

/**
 * An event that is fired when a page visit starts.
 * @type {Events.Event}
 * @const
 */
export const onPageVisitStop = new Events.Event({
    // Filter notifications for events in private windows
    pageVisitStopListenerCallback: ([ details ], listenerOptions) => {
        if(!details.privateWindow || (("privateWindows" in listenerOptions) && listenerOptions.privateWindows))
            return true;
        return false;
    }
});

/**
 * Notify listeners for the page visit stop event.
 * @param {PageVisitStopDetails} details - Additional information about the page visit stop event.
 * @private
 */
function pageVisitStop(details) {
    onPageVisitStop.notifyListeners([ details ]);
}

/** 
 * Notify a page that its attention state may have changed.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {boolean} pageHasAttention - Whether the tab containing the page has the user's
 * attention.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
function sendPageAttentionUpdate(tabId, pageHasAttention, timeStamp = Date.now()) {
    Messaging.sendMessageToTab(tabId, {
        type: "WebScience.Utilities.PageManager.pageAttentionUpdate",
        pageHasAttention,
        timeStamp
    });
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
    return ((currentActiveTab === tabId) && (currentFocusedWindow === windowId) && (considerUserInputForAttention ? browserIsActive : true));
}

/**
 * @typedef {Object} WindowDetails
 * @property {number} activeTab - The ID of the active tab in the window,
 * or -1 if there is no active tab.
 */

/**
 * A Map that tracks the current state of browser windows. We need this cached
 * state to avoid asynchronous queries when the focused window changes. The
 * keys are window IDs and the values are WindowDetails objects.
 * @private
 * @const {Map<number,WindowDetails>}
 * @default
 */
const windowState = new Map();

/**
 * Update the window state cache with new information about a window.
 * @private
 * @param {number} windowId - The window ID.
 * @param {WindowDetails} windowDetails - The new information about the
 * window.
 */
function updateWindowState(windowId, { activeTab }) {
    let windowDetails = windowState.get(windowId);

    if(windowDetails === undefined) {
        windowDetails = { activeTab: -1 };
        windowState.set(windowId, windowDetails);
    }

    if(activeTab !== undefined)
        windowDetails.activeTab = activeTab;
}

/**
 * Whether the browser is active or idle. Ignored if the module is configured to
 * not consider user input when determining the attention state.
 * @private
 * @type {boolean}
 * @default
 */
var browserIsActive = false;

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
 * Configure message passing between the background script and content script, register browser
 * event handlers, cache initial state, and register the content script. Runs only once.
 * @private
 */
export async function initialize() {
    if(initialized || initializing)
        return;
    initializing = true;
    
    // Register message listeners and schemas for communicating with the content script

    // The content script sends a WebScience.Utilities.PageManger.pageVisitStart message when
    // there is a page visit start event
    Messaging.registerListener("WebScience.Utilities.PageManager.pageVisitStart", (pageVisitStartInfo, sender) => {
        // Notify the content script if it has attention
        // We can't send this message earlier (e.g., when the tab URL changes) because we need to know the content
        // script is ready to receive the message
        if(checkForAttention(sender.tab.id, sender.tab.windowId))
            sendPageAttentionUpdate(sender.tab.id, true, Date.now());

        pageVisitStart({
            pageId: pageVisitStartInfo.pageId,
            tabId: sender.tab.id,
            windowId: sender.tab.windowId,
            url: pageVisitStartInfo.url,
            referrer: pageVisitStartInfo.referrer,
            pageVisitStartTime: pageVisitStartInfo.timeStamp,
            privateWindow: pageVisitStartInfo.privateWindow
        });
    }, {
        pageId: "string",
        url: "string",
        referrer: "string",
        timeStamp: "number",
        privateWindow: "boolean"
    });

    // The content script sends a WebScience.Utilities.PageManger.pageVisitStop message when
    // there is a page visit stop event
    // We don't currently include tab or window information with the page visit stop event
    // because the sender object doesn't include that information when the tab is closing
    Messaging.registerListener("WebScience.Utilities.PageManager.pageVisitStop", (pageVisitStopInfo) => {
        pageVisitStop({
            pageId: pageVisitStopInfo.pageId,
            url: pageVisitStopInfo.url,
            referrer: pageVisitStopInfo.referrer,
            pageVisitStartTime: pageVisitStopInfo.timeStamp,
            pageVisitStopTime: pageVisitStopInfo.timeStamp,
            privateWindow: pageVisitStopInfo.privateWindow
        });
    }, {
        pageId: "string",
        url: "string",
        referrer: "string",
        timeStamp: "number",
        pageVisitStartTime: "number",
        privateWindow: "boolean"
    });

    // The background script sends a WebScience.Utilities.PageManager.pageAttentionUpdate message
    // when the attention state of the page may have changed
    Messaging.registerSchema("WebScience.Utilities.PageManager.pageAttentionUpdate", {
        timeStamp: "number",
        pageHasAttention: "boolean"
    });

    // The background script sends a WebScience.Utilities.PageManager.urlChanged message when
    // the URL changes for a tab, indicating a possible page load with the History API
    Messaging.registerSchema("WebScience.Utilities.PageManager.urlChanged", {
        timeStamp: "number"
    });

    // The background script sends a WebScience.Utilities.PageManager.pageAudioUpdate message
    // when the audio state of the page may have changed
    Messaging.registerSchema("WebScience.Utilities.PageManager.pageAudioUpdate", {
        pageHasAudio: "boolean",
        timeStamp: "number"
    });

    // Register background script event handlers

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if(!initialized)
            return;
        let timeStamp = Date.now();
        
        // If the URL changed, send WebScience.Utilities.PageManager.urlChanged
        if("url" in changeInfo)
            Messaging.sendMessageToTab(tabId, {
                type: "WebScience.Utilities.PageManager.urlChanged",
                timeStamp
            });

        // If the audible state changed, send WebScience.Utilities.PageManager.pageAudioUpdate
        if("audible" in changeInfo)
            Messaging.sendMessageToTab(tabId, {
                type: "WebScience.Utilities.PageManager.pageAudioUpdate",
                pageHasAudio: changeInfo.audible,
                timeStamp
            });
    }, {
        urls: [ "http://*/*", "https://*/*" ]
    });

    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
        if(!initialized)
            return;

        // We don't have to update the window state here, because either there is
        // another tab in the window that will become active (and tabs.onActivated
        // will fire), or there is no other tab in the window so the window closes
        // (and windows.onRemoved will fire)
        
        // If this is the active tab, forget it
        if(currentActiveTab === tabId)
            currentActiveTab = -1;
    });

    // Handle when the active tab in a window changes
    browser.tabs.onActivated.addListener(activeInfo => {
        if(!initialized)
            return;
        var timeStamp = Date.now();

        // If this is a non-browser tab, ignore it
        if((activeInfo.tabId === browser.tabs.TAB_ID_NONE) || (activeInfo.tabId < 0) ||
            (activeInfo.windowId < 0))
            return;

        // Update the window state cache with the new
        // active tab ID
        updateWindowState(activeInfo.windowId, {
            activeTab: activeInfo.tabId
        });
        
        // If there isn't a focused window, or the tab update is not in the focused window, ignore it
        if((currentFocusedWindow < 0) || (activeInfo.windowId != currentFocusedWindow))
            return;

        // If the browser is active or (optionally) we are not considering user input,
        // notify the current page with attention that it no longer has attention, and notify
        // the new page with attention that is has attention
        if((browserIsActive || !considerUserInputForAttention)) {
            if((currentActiveTab >= 0) && (currentFocusedWindow >= 0))
                sendPageAttentionUpdate(currentActiveTab, false, timeStamp);
            sendPageAttentionUpdate(activeInfo.tabId, true, timeStamp);
        }
        
        // Remember the new active tab
        currentActiveTab = activeInfo.tabId;
    });

    browser.windows.onRemoved.addListener(windowId => {
        if(!initialized)
            return;
        
        // If we have cached state for this window, drop it
        windowState.delete(windowId);
    });

    browser.windows.onFocusChanged.addListener(windowId => {
        if(!initialized)
            return;
        var timeStamp = Date.now();

        // If the browser is active or (optionally) we are not considering user input, and if
        // if there is an active tab in a focused window, notify the current page with attention
        // that it no longer has attention
        if((browserIsActive || !considerUserInputForAttention) && ((currentActiveTab >= 0) && (currentFocusedWindow >= 0)))
            sendPageAttentionUpdate(currentActiveTab, false, timeStamp);

        // If the browser has lost focus in the operating system, remember 
        // tab ID = -1 and window ID = -1, and do not notify any page that it has attention
        // Note that this check should happen before the browser.windows.get await below,
        // because quick sequential events can cause the browser.windows.onFocusChanged
        // listener to run again before the await resolves and trigger errors if currentActiveTab
        // and currentFocusedWindow are not set properly
        if (windowId === browser.windows.WINDOW_ID_NONE) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }

        // Get information about the focused window from the cached window state
        var focusedWindowDetails = windowState.get(windowId);

        // If we haven't seen this window before, that means it's not a browser window,
        // so remember tab ID = -1 and window ID -1, and do not notify any page that it has attention
        if(focusedWindowDetails === undefined) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }

        // Otherwise, remember the new active tab and focused window, and if the browser is active
        // or (optionally) we are not considering user input, notify the page in the tab that it
        // has attention
        currentActiveTab = focusedWindowDetails.activeTab;
        currentFocusedWindow = windowId;
        if(browserIsActive || !considerUserInputForAttention)
            sendPageAttentionUpdate(currentActiveTab, true, timeStamp);
    });
    
    // Handle when the browser activity state changes
    // This listener abstracts the browser activity state into two categories: active and inactive
    // Active means the user has recently provided input to the browser, inactive means any other
    // state (regardless of whether a screensaver or lock screen is enabled)

    // Note that we have to call Idle.registerIdleStateListener before we call
    // Idle.queryState, so this comes before caching the initial state
    if(considerUserInputForAttention) {
        await Idle.registerIdleStateListener(newState => {
            if(!initialized)
                return;
            var timeStamp = Date.now();

            // If the browser is not transitioning between active and inactive states, ignore the event
            if((browserIsActive) === (newState === "active"))
                return;
            
            // Remember the flipped browser activity state
            browserIsActive = !browserIsActive;

            // If there isn't an active tab in a focused window, we don't need to send attention events
            if((currentActiveTab < 0) || (currentFocusedWindow < 0))
                return;

            // Send an attention state change event to the current active tab, reflecting the browser activity state
            sendPageAttentionUpdate(currentActiveTab, browserIsActive, timeStamp);
        }, idleThreshold);
    }

    // Cache the initial idle, window, and tab state

    if(considerUserInputForAttention)
        browserIsActive = (Idle.queryState(idleThreshold) === "active");
    
    let openWindows = await browser.windows.getAll({
        populate: true
    });
    for(const openWindow of openWindows) {
        // If the window doesn't have a window ID, ignore it
        // This shouldn't happen, but checking anyway since
        // the id property is optional in the windows.Window
        // type
        if(!("id" in openWindow))
            continue;
        // Iterate the tabs in the window to cache tab state
        // and find the active tab in the window
        var activeTabInOpenWindow = -1;
        if("tabs" in openWindow)
            for(const tab of openWindow.tabs) {
                if(tab.active)
                    activeTabInOpenWindow = tab.id;
            }
        updateWindowState(openWindow.id, {
            activeTab: activeTabInOpenWindow
        });

        // If this is the focused window and it is a normal or popup
        // window, remember the window ID and active tab ID (if any)
        // If there is no focused window, or the focused window isn't
        // a normal or popup window, this block will not run and we
        // will retain the default values of tab ID = -1 and window
        // ID = -1
        if(openWindow.focused) {
            currentFocusedWindow = openWindow.id;
            currentActiveTab = activeTabInOpenWindow;
        }
    }

    // Register the PageManager content script for all HTTP(S) URLs
    browser.contentScripts.register({
        matches: [ "http://*/*", "https://*/*" ],
        js: [{
            file: "/WebScience/Utilities/content-scripts/pageManager.js"
        }],
        runAt: "document_start"
    });

    initializing = false;
    initialized = true;
}
