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
 *   * The `tabs.onCreated` event appears to consistently fire before the `windows.onCreated`
 *     event, so this module listens to the `tabs.onCreated` event to get an earlier view of
 *     window details.
 *   * Non-browser windows do not appear in the results of `windows.getAll()`, and calling
 *     `windows.get()` on a non-browser window throws an error. Switching focus to a non-
 *     browser window will, however, fire the `windows.onFocusChanged` event. The module
 *     assumes that if `windows.onFocusChanged` fires with an unknown window, that window
 *     is a non-browser window.
 *   * The module assumes that valid tab IDs and window IDs are always >= 0.
 *   * The module listens for `tabs.onAttached` to track tab movement between windows. It does
 *     not listen for `tabs.onDetached` so that tabs remain associated with valid windows and
 *     because it's likely the user is just moving the tab within the tab strip in a window.
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
 * A listener function for page visit start events.
 * @callback pageVisitStartListener
 * @param {Object} details - Additional information about the page visit start event.
 * @param {number} details.tabId - The tab containing the page, unique to the browsing session.
 * @param {number} details.windowId - The window containing the page, unique to the browsing session.
 * Note that tabs can subsequently move between windows.
 * @param {string} details.url - The URL of the page loading in the tab.
 * @param {string} details.referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @param {number} details.timeStamp - The time when the underlying event fired.
 */

/**
 * Additional information about a page visit start event listener function.
 * @typedef {Object} PageVisitStartListenerDetails
 * @property {boolean} privateWindows - Whether to notify the listener function for events in private windows.
 * @property {pageVisitStartListener} listener - The listener function.
 */

/**
 * The set of listener details for page visit start events.
 * @private
 * @constant {Set<PageVisitStartListenerDetails>}
 */
const pageVisitStartListenerSet = new Set();

/** 
 * Register a listener function that will be notified about page visit start events.
 * @param {pageVisitStartListener} pageVisitStartListener - The listener function.
 * @param {boolean} [privateWindows=false] - Whether the listener should be fired for events in private windows.
 * @param {number} [timeStamp=Date.now()] - The time to use if the listener should be fired for the currently open set of pages.
 */
export async function registerPageVisitStartListener(pageVisitStartListener, privateWindows = false, timeStamp = Date.now()) {
    initialize();
    pageVisitStartListenerSet.add({
        listener: pageVisitStartListener,
        privateWindows: privateWindows
    });
}

/** 
 * Notify page visit start listeners about a page visit start event.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {number} windowId - The window containing the page, unique to the browsing session.
 * @param {string} url - The URL of the page loading in the tab.
 * @param {string} referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @param {boolean} privateWindow - Whether the event is in a private window.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
function notifyPageVisitStartListeners(tabId, windowId, url, referrer, privateWindow, timeStamp = Date.now()) {
    for (const pageVisitStartListenerDetails of pageVisitStartListenerSet)
        if(!privateWindow || pageVisitStartListenerDetails.privateWindows)
            pageVisitStartListenerDetails.listener({
                tabId,
                windowId,
                url: url.repeat(1), // copy the string in case a listener modifies it
                referrer: referrer.repeat(1),
                privateWindow,
                timeStamp
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
 * Additional information about a page visit start stop listener function.
 * @typedef {Object} PageVisitStopListenerDetails
 * @property {boolean} privateWindows - Whether to notify the listener function for events in private windows.
 * @property {pageVisitStopListener} listener - The listener function.
 */

/**
 * The set of listener details for page visit stop events.
 * @private
 * @constant {Set<PageVisitStopListenerDetails>}
 */
const pageVisitStopListenerSet = new Set();

/**
 * Register a listener function that will be notified about page visit stop events.
 * @param {pageVisitStopListener} pageVisitStopListener - The listener function.
 * @param {boolean} [privateWindows=false] - Whether the listener should be fired for events in private windows.
 */
export function registerPageVisitStopListener(pageVisitStopListener, privateWindows = false) {
    initialize();
    pageVisitStopListenerSet.add({
        listener: pageVisitStopListener,
        privateWindows: privateWindows
    });
}

/** 
 * Notify page visit stop listeners about a page visit stop event.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {number} windowId - The window containing the page, unique to the browsing session.
 * @param {boolean} privateWindow - Whether the event is in a private window.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
function notifyPageVisitStopListeners(tabId, windowId, privateWindow, timeStamp = Date.now()) {
    for (const pageVisitStopListenerDetails of pageVisitStopListenerSet)
        if(!privateWindow || pageVisitStopListenerDetails.privateWindows)
            pageVisitStopListenerDetails.listener({ tabId, windowId, timeStamp });
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
 * Additional information about a page attention start event listener function.
 * @typedef {Object} PageAttentionStartListenerDetails
 * @property {boolean} privateWindows - Whether to notify the listener function for events in private windows.
 * @property {pageAttentionStartListener} listener - The listener function.
 */

/**
 * The set of listener details for page attention start events.
 * @private
 * @constant {Set<PageAttentionStartListenerDetails>}
 */
const pageAttentionStartListenerSet = new Set();

/** 
 * Register a listener function that will be notified about page attention start events.
 * @param {pageAttentionStartListener} pageAttentionStartListener - The listener function. 
 * @param {boolean} [privateWindows=false] - Whether the listener should be fired for events in private windows.
 * @param {number} [timeStamp=Date.now()] - The time to use if the listener should be fired
 * for the page that currently has attention (if there is one).
 */
export async function registerPageAttentionStartListener(pageAttentionStartListener, privateWindows = false, timeStamp = Date.now()) {
    initialize();
    pageAttentionStartListenerSet.add({
        listener: pageAttentionStartListener,
        privateWindows: privateWindows
    });
}

/** 
 * Notify page attention start listeners and content scripts about a page attention start event.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {number} windowId - The window containing the page, unique to the browsing session.
 * @param {boolean} privateWindow - Whether the event is in a private window.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
function notifyPageAttentionStartListeners(tabId, windowId, privateWindow, timeStamp = Date.now()) {
    for (const pageAttentionStartListenerDetails of pageAttentionStartListenerSet)
        if(!privateWindow || pageAttentionStartListenerDetails.privateWindows)
            pageAttentionStartListenerDetails.listener({ tabId, windowId, timeStamp });
    if(!privateWindow)
        Messaging.sendMessageToTab(tabId, {
            type: "WebScience.Utilities.PageManager.pageAttentionUpdate",
            timeStamp,
            pageHasAttention: true
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
 * Additional information about a page attention stop event listener function.
 * @typedef {Object} PageAttentionStopListenerDetails
 * @property {boolean} privateWindows - Whether to notify the listener function for events in private windows.
 * @property {pageAttentionStartListener} listener - The listener function.
 */

/**
 * The set of listener details for page attention stop events.
 * @private
 * @constant {Set<PageAttentionStopListenerDetails>}
 */
const pageAttentionStopListenerSet = new Set();

/** 
 * Register a listener function that will be notified about page attention stop events.
 * @param {pageAttentionStopListener} pageAttentionStopListener - The listener function. 
 */
export async function registerPageAttentionStopListener(pageAttentionStopListener, privateWindows = false) {
    initialize();
    pageAttentionStopListenerSet.add({
        listener: pageAttentionStopListener,
        privateWindows: privateWindows
    });
}

/** 
 * Notify page attention stop listeners and content scripts about a page attention stop event.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {number} windowId - The window containing the page, unique to the browsing session.
 * @param {boolean} privateWindow - Whether the event is in a private window.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
function notifyPageAttentionStopListeners(tabId, windowId, privateWindow, timeStamp = Date.now()) {
    for (const pageAttentionStopListenerDetails of pageAttentionStopListenerSet)
        if(!privateWindow || pageAttentionStopListenerDetails.privateWindows)
            pageAttentionStopListenerDetails.listener({
                tabId: tabId,
                windowId: windowId,
                timeStamp: timeStamp
            });
    if(!privateWindow)
        Messaging.sendMessageToTab(tabId, {
            type: "WebScience.Utilities.PageManager.pageAttentionUpdate",
            timeStamp,
            pageHasAttention: false
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
 * @property {boolean} privacy - Whether the window is a private window. Values
 * are `"normal"` for a non-private window, `"private"` for a private window,
 * and `"unknown"` if the window's privacy status is unknown.
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
 * Update the window state cache with new information about a window. If
 * we already know more specific information about the window than
 * the new information, ignore the new information.
 * @private
 * @param {number} windowId - The window ID.
 * @param {WindowDetails} windowDetails - The new information about the
 * window.
 */
function updateWindowState(windowId, {
    activeTab,
    privacy = "unknown"
}) {
    var windowDetails = windowState.get(windowId);

    // If we don't have any cached state on the window, save
    // what we know now and be done
    if(windowDetails === undefined) {
        windowState.set(windowId, {
            activeTab: (activeTab !== undefined) ? activeTab : -1,
            privacy: privacy
        });
        return;
    }

    // If the update has an active tab ID, update the cached
    // active tab ID
    if(activeTab !== undefined)
        windowDetails.activeTab = activeTab;

    // If the update has more information about the window
    // privacy property than the cached window details,
    // update the cached window privacy property
    if((privacy !== "unknown") && (windowDetails.privacy === "unknown"))
        windowDetails.privacy = privacy;
}

/**
 * Look up the privacy property of a window in the cached window state.
 * If the cached window state does not include the window or the window
 * privacy property is unknown (neither of which should happen!), assume
 * it's a normal window.
 * @private
 * @param {number} windowId - The window ID.
 * @param {WindowDetails} [windowDetails] - The WindowDetails object
 * for the window, if it's already been retrieved.
 * @returns {boolean} Whether the window is a private window.
 */
function isPrivateWindow(windowId, windowDetails) {
    if(windowDetails === undefined)
        windowDetails = windowState.get(windowId);
    return (windowDetails !== undefined) ? (windowDetails.privacy === "private") : false;
}

/**
 * @typedef {Object} TabDetails
 * @property {boolean} privateWindow - Whether the tab is in a private window.
 * @property {number} windowId - The ID of the window containing the tab.
 */

/**
 * A Map that tracks the current state of browser tabs. We need this cached
 * state to avoid inconsistencies when registering a page visit start listener
 * and to filter notifications for tabs that don't contain ordinary webpages.
 * The keys are tab IDs and the values are TabDetails objects.
 * @private
 * @const {Map<number,TabDetails>}
 * @default
 */
const tabState = new Map();

/**
 * Update the tab state cache with new information about a tab. Any
 * existing information about the tab is replaced.
 * @private
 * @param {number} tabId - The tab ID.
 * @param {string} privateWindow - Whether the tab is in a private
 * window.
 * @param {string} windowId - The ID of the window containing the tab.
 */
function updateTabState(tabId, privateWindow, windowId) {
    tabState.set(tabId, { privateWindow, windowId });
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
 * Configure browser event handlers and cache initial state. Runs only once.
 * @private
 */
export async function initialize() {
    if(initialized || initializing)
        return;
    initializing = true;
    
    // Register the page visit start message handler and schema
    Messaging.registerListener("WebScience.Utilities.PageManager.pageVisitStart", (pageVisitStartInfo) => {
        debugLog("Page Visit Start: " + JSON.stringify(pageVisitStartInfo));
    }, {
        pageId: "string",
        url: "string",
        referrer: "string",
        timeStamp: "number"
    });

    // Register the page visit stop message handler and schema
    Messaging.registerListener("WebScience.Utilities.PageManager.pageVisitStop", (pageVisitStopInfo) => {
        debugLog("Page Visit Stop: " + JSON.stringify(pageVisitStopInfo));
    }, {
        pageId: "string",
        url: "string",
        referrer: "string",
        timeStamp: "number"
    });

    // Register the page attention update message schema
    Messaging.registerSchema("WebScience.Utilities.PageManager.pageAttentionUpdate", {
        timeStamp: "number",
        pageHasAttention: "boolean"
    });

    // Register the URL changed message schema
    Messaging.registerSchema("WebScience.Utilities.PageManager.urlChanged", {
        timeStamp: "number"
    });

    // When the URL changes for a tab, send the event to the tab
    // That could signal a page load with the Histoy API,
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if("url" in changeInfo)
            Messaging.sendMessageToTab(tabId, {
                type: "WebScience.Utilities.PageManager.urlChanged",
                timeStamp: Date.now()
            });
    }, {
        urls: [ "http://*/*", "https://*/*" ]
    });

    // Register the page audio update message schema
    Messaging.registerSchema("WebScience.Utilities.PageManager.pageAudioUpdate", {
        pageHasAudio: "boolean",
        timeStamp: "number"
    });

    // When the audible state changes for a tab, send an event to the tab
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        Messaging.sendMessageToTab(tabId, {
            type: "WebScience.Utilities.PageManager.pageAudioUpdate",
            pageHasAudio: changeInfo.audible,
            timeStamp: Date.now()
        });
    }, {
        urls: [ "http://*/*", "https://*/*" ],
        properties: [ "audible" ]
    });
    
    // Register the PageManager content script for all HTTP(S) URLs
    browser.contentScripts.register({
        matches: [ "http://*/*", "https://*/*" ],
        js: [{
            file: "/WebScience/Utilities/content-scripts/pageManager.js"
        }],
        runAt: "document_start"
    });

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

        // Try to get the referrer from the web request cache and consume
        // the most recent entry in the web request cache
        var referrer = "";

        // Update the tab state cache
        updateTabState(tabId, changeInfo.url, referrer, tab.incognito, tab.windowId);

        // If this is the active tab and focused window, and (optionally) the browser is active, end the attention span
        var hasAttention = checkForAttention(tabId, tab.windowId);
        if (hasAttention)
            notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, tab.incognito, timeStamp);

        // End the page visit
        notifyPageVisitStopListeners(tabId, tab.windowId, tab.incognito, timeStamp);
        
        // Start the page visit
        notifyPageVisitStartListeners(tabId, tab.windowId, changeInfo.url, referrer, tab.incognito, timeStamp);

        // If this is the active tab and focused window, and (optionally) the browser is active, start an attention span
        if (hasAttention)
            notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, tab.incognito, timeStamp);
    });

    // Handle when a tab closes
    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
        if(!initialized)
            return;
        var timeStamp = Date.now();

        // We don't have to update the window state here, because either there is
        // another tab in the window that will become active (and tabs.onActivated
        // will fire), or there is no other tab in the window so the window closes
        // (and windows.onRemoved will fire)

        // If we have cached state for this tab, drop it
        tabState.delete(tabId);

        // Get the window privacy property from the cached window state
        var windowPrivacy = isPrivateWindow(removeInfo.windowId);

        // If this is the active tab and focused window, and (optionally) the browser is active, end the attention span
        if(checkForAttention(tabId, removeInfo.windowId))
            notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, windowPrivacy, timeStamp);
        
        // If this is the active tab, forget it
        if(currentActiveTab == tabId)
            currentActiveTab = -1;

        // End the page visit
        notifyPageVisitStopListeners(tabId, removeInfo.windowId, windowPrivacy, timeStamp);
    });

    // Handle when the active tab in a window changes
    browser.tabs.onActivated.addListener(activeInfo => {
        if(!initialized)
            return;
        var timeStamp = Date.now();

        // If this is a non-browser tab, ignore it
        if((activeInfo.tabId == browser.tabs.TAB_ID_NONE) || (activeInfo.tabId < 0) ||
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

        // Get the window privacy property from the window state cache
        var windowPrivacy = isPrivateWindow(activeInfo.windowId);    

        // If the browser is active or (optionally) we are not considering user input,
        // first end the attention span if there is an active tab in the focused window,
        // then start a new attention span
        if((browserIsActive || !considerUserInputForAttention)) {
            if((currentActiveTab >= 0) && (currentFocusedWindow >= 0))
                notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, windowPrivacy, timeStamp);
            notifyPageAttentionStartListeners(activeInfo.tabId, currentFocusedWindow, windowPrivacy, timeStamp);
        }
        
        // Remember the new active tab
        currentActiveTab = activeInfo.tabId;
    });

    // Handle when a window is created
    browser.windows.onCreated.addListener(createdWindow => {
        if(!initialized)
            return;
        
        // If this appears to be a non-browsing window, ignore
        // the event
        if(!("id" in createdWindow) || createdWindow.id < 0)
            return;

        // Update the window state cache with the window's privacy property
        updateWindowState(createdWindow.id, {
            privacy: createdWindow.incognito ? "private" : "normal"
        });
    });

    // Handle when a tab is created
    // This event appears to consistently fire before window.onCreated
    browser.tabs.onCreated.addListener(tab => {
        if(!initialized)
            return;
        
        // If there is a tab or window ID indicating a non-browser tab or
        // window, ignore the event
        // This shouldn't happen!
        if(!("id" in tab) || tab.id < 0 || !("windowId" in tab) || tab.windowId < 0)
            return;
        
        // Update the window state cache with the window's privacy
        // property
        // While we might now know this is the active tab in the window,
        // the tabs.onActivated event will separately fire
        updateWindowState(tab.windowId, {
            privacy: tab.incognito ? "private" : "normal"
        });
    });

    // Handle when a tab is moved between windows
    // We are not listening for tabs.onDetached because we want tabs
    // to be associated with valid windows, and because it's likely
    // the user is just moving the tab within the tab strip in a
    // window
    browser.tabs.onAttached.addListener((tabId, attachInfo) => {
        // If this tab is in the tab state cache,
        // update the cache
        var tabDetails = tabState.get(tabId);
        if(tabDetails !== undefined)
            tabDetails.windowId = attachInfo.newWindowId;
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
        if((browserIsActive || !considerUserInputForAttention) && ((currentActiveTab >= 0) && (currentFocusedWindow >= 0)))
            notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, isPrivateWindow(currentFocusedWindow), timeStamp);

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

        // If we haven't seen this window before, that means it's not a browser window,
        // so remember tab ID = -1 and window ID -1, and do not start a new attention span
        if(focusedWindowDetails === undefined) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }

        // Otherwise, remember the new active tab and focused window, and if the browser is active
        // or (optionally) we are not considering user input, start a new attention span
        currentActiveTab = focusedWindowDetails.activeTab;
        currentFocusedWindow = windowId;
        if(browserIsActive || !considerUserInputForAttention)
            notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, isPrivateWindow(windowId, focusedWindowDetails), timeStamp);
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
            if((browserIsActive) == (newState === "active"))
                return;
            
            // Remember the flipped browser activity state
            browserIsActive = !browserIsActive;

            // If there isn't an active tab in a focused window, we don't need to send attention events
            if((currentActiveTab < 0) || (currentFocusedWindow < 0))
                return;
            
            // Get the window privacy property from the cached window state
            var windowPrivacy = isPrivateWindow(currentFocusedWindow);

            // Send an attention start event (if the browser is transitioning to active) or an
            // attention stop event (if the browser is transitioning to inactive)
            if(browserIsActive)
                notifyPageAttentionStartListeners(currentActiveTab, currentFocusedWindow, windowPrivacy,  timeStamp);
            else
                notifyPageAttentionStopListeners(currentActiveTab, currentFocusedWindow, windowPrivacy, timeStamp);
        }, idleThreshold);
    }

    // Get and remember the browser idle state
    if(considerUserInputForAttention)
        browserIsActive = (Idle.queryState(idleThreshold) === "active");
    
    // Get and remember the browser window and tab state
    var openWindows = await browser.windows.getAll({
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
                updateTabState(tab.id, tab.url, "", openWindow.incognito, openWindow.id);
            }
        updateWindowState(openWindow.id, {
            activeTab: activeTabInOpenWindow,
            privacy: openWindow.incognito ? "private" : "normal"
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

    initializing = false;
    initialized = true;
}
