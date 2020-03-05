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
 * Some known limitations to be aware of:
 *   * The module does not currently filter tab-level content by protocol or content type. We
 *     might want to revisit this. Filtering by protocol is easy—the module already tracks
 *     whether a tab contains content loaded via HTTP or HTTPS. Filtering by content type is
 *     more difficult. We might be able to accomplish that by using `webRequest.onHeadersReceived`
 *     to start page visits and checking the `Content-Type` header, though we'd still have to handle
 *     tabs that are open when the module initializes, and we'd miss pages that rely on MIME type
 *     sniffing.
 *   * When the module initializes, there isn't a good way to get the referrers for open
 *     tabs without either delaying initialization or risking a race condition. The
 *     referrers for pages open when the module initializes are currently set to `""`.
 * 
 * And some implementation quirks to be aware of for future development on this module:
 *   * The `tabs.onCreated` event appears to consistently fire before the `windows.onCreated`
 *     event, so this module listens to the `tabs.onCreated` event to get an earlier view of
 *     window details. The module assumes that a `tabs.onCreated` event with a positive tab
 *     ID is for a `"normal"` or `"popup"` window type.
 *   * Non-browser windows do not appear in the results of `windows.getAll()`, and calling
 *     `windows.get()` on a non-browser window throws an error. Switching focus to a non-
 *     browser window will, however, fire the `windows.onFocusChanged` event. The module
 *     assumes that if `windows.onFocusChanged` fires with an unknown window, that window
 *     is a non-browser window.
 *   * The module assumes that valid tab IDs and window IDs are always >= 0.
 *   * The module assumes that, if there was a `webRequest.onBeforeSendHeaders` event before a
 *     `tabs.onUpdated` event with the same tab ID and URL, the web request matches the tab
 *     update. This assumption is needed to match referrers to new pages in tabs.
 *   * The module listens for `tabs.onAttached` to track tab movement between windows. It does
 *     not listen for `tabs.onDetached` so that tabs remain associated with valid windows and
 *     because it's likely the user is just moving the tab within the tab strip in a window.
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
 * @param {string} details.referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @param {number} details.timeStamp - The time when the underlying browser event fired.
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
 * @param {boolean} [notifyAboutCurrentPages=true] - Whether the listener should be fired for the currently open set of pages.
 * @param {boolean} [privateWindows=false] - Whether the listener should be fired for events in private windows.
 * @param {number} [timeStamp=Date.now()] - The time to use if the listener should be fired for the currently open set of pages.
 */
export async function registerPageVisitStartListener(pageVisitStartListener, notifyAboutCurrentPages = true, privateWindows = false, timeStamp = Date.now()) {
    initialize();
    pageVisitStartListenerSet.add({
        listener: pageVisitStartListener,
        privateWindows: privateWindows
    });
    if(notifyAboutCurrentPages)
        notifyPageVisitStartListenerAboutCurrentPages(pageVisitStartListener, privateWindows, timeStamp);
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
 * Notify a page visit start listener about the current set of open pages. Useful for when
 * a listener is registered in the middle of a browsing session (e.g., because the extension
 * was just installed or the user just gave consent).
 * @private
 * @param {pageVisitStartListener} pageVisitStartListener - The listener.
 * @param {boolean} privateWindows - Whether to notify the listener about pages in private
 * windows.
 * @param {number} timeStamp - The time when the listener was registered.
 */
async function notifyPageVisitStartListenerAboutCurrentPages(pageVisitStartListener, privateWindows, timeStamp) {
    // Load the tabs from the tab state cache to avoid inconsistencies
    for (const [tabId, tabDetails] of tabState)
        if(!tabDetails.privateWindow || privateWindows)
            pageVisitStartListener({
                tabId: tabId,
                windowId: tabDetails.windowId,
                url: tabDetails.url.repeat(1), // copy the string in case a listener modifies it
                referrer: tabDetails.referrer.repeat(1),
                privateWindow: tabDetails.privateWindow,
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
 * @param {boolean} [notifyAboutCurrentPages=true] - Whether the listener should be fired
 * for the page that currently has attention (if there is one).
 * @param {boolean} [privateWindows=false] - Whether the listener should be fired for events in private windows.
 * @param {number} [timeStamp=Date.now()] - The time to use if the listener should be fired
 * for the page that currently has attention (if there is one).
 */
export async function registerPageAttentionStartListener(pageAttentionStartListener, notifyAboutCurrentPageAttention = true, privateWindows = false, timeStamp = Date.now()) {
    initialize();
    pageAttentionStartListenerSet.add({
        listener: pageAttentionStartListener,
        privateWindows: privateWindows
    });
    if(notifyAboutCurrentPageAttention)
        notifyPageAttentionStartListenerAboutCurrentPageAttention(pageAttentionStartListener, privateWindows, timeStamp);
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
    if(notifyContentScriptsAboutPageAttention && (!privateWindow || notifyContentScriptsInPrivateWindowsAboutPageAttention))
        browser.tabs.sendMessage(tabId, { type: "WebScience.pageAttentionStart" });
}

/**
 * Notify a page attention start listener about the currently active tab in the currently
 * focused window (if there is such a tab). Useful for when a listener is registered in the
 * middle of a browsing session (e.g., because the extension was just installed or the user
 * just gave consent).
 * @private
 * @param {pageAttentionStartListener} pageAttentionStartListener - The listener.
 * @param {boolean} privateWindows - Whether to notify the listener if the page with
 attention is in a private window.
 * @param {number} timeStamp - The time when the listener was registered.
 */
async function notifyPageAttentionStartListenerAboutCurrentPageAttention(pageAttentionStartListener, privateWindows, timeStamp) {
    // If there is no active tab or no focused window, there is no notification to provide
    if((currentActiveTab < 0) || (currentFocusedWindow < 0))
        return;

    // If the module should consider user input and the browser is inactive, there is no notification to provide
    if(considerUserInputForAttention && !browserIsActive)
        return;

    // If the listener should not receive notifications about private windows and this is a private window
    // according to the window state cache, there is no notification to provide
    if(!privateWindows && isPrivateWindow(currentFocusedWindow))
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
    if(notifyContentScriptsAboutPageAttention && (!privateWindow || notifyContentScriptsInPrivateWindowsAboutPageAttention))
        browser.tabs.sendMessage(tabId, { type: "WebScience.pageAttentionStop" });
}

/**
 * Whether to notify content scripts in non-private windows about page attention state changes.
 * @private
 * @type {boolean}
 * @default
 */
var notifyContentScriptsAboutPageAttention = false;

/**
 * Whether to notify content scripts in private windows about page attention state changes.
 * @private
 * @type {boolean}
 * @default
 */
var notifyContentScriptsInPrivateWindowsAboutPageAttention = false;

/**
 * Set whether to notify content scripts about page attention state changes.
 * Content scripts will receive the message `{ type: "WebScience.pageAttentionStart" }`
 * when the page gains attention, and will receive the message `{ type: "WebScience.pageAttentionStop" }`
 * when the page loses attention. This module does not provide notifications
 * to content scripts about page visit state changes, because content scripts
 * can observe those directly and there is a possible race condition with closing a page.
 * @param {boolean} notificationSetting - Whether to notify content scripts
 * about page attention state changes.
 * @param {boolean} privateWindows - Whether to notify content scripts in private windows.
 */
export async function setPageAttentionContentScriptMessages(notificationSetting, privateWindows = false) {
    initialize();
    notifyContentScriptsAboutPageAttention = notificationSetting;
    notifyContentScriptsInPrivateWindowsAboutPageAttention = privateWindows;
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
    return ((currentActiveTab == tabId) && (currentFocusedWindow == windowId) && (considerUserInputForAttention ? browserIsActive : true));
}

/**
 * @typedef {Object} WindowDetails
 * @property {string} type - The type of window. This string can have the
 * same values as `windows.WindowType` (`"normal"`, `"popup"`, `"panel"`, and
 * `"devtools"`), plus the value `"normalorpopup"` if we don't yet know which
 * of the two types the window is.
 * @property {number} activeTab - The ID of the active tab in the window,
 * or -1 if there is no active tab.
 * @property {boolean} privacy - Whether the window is a private window. Values
 * are `"normal"` for a non-private window, `"private"` for a private window,
 * and `"unknown"` if the window's privacy status is unknown.
 */

/**
 * A Map that tracks the current state of browser windows. We need this cached
 * state to avoid asynchronous queries when the focused window changes. The
 * keys are tab IDs and the values are WindowDetails objects.
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
    type = "unknown",
    activeTab,
    privacy = "unknown"
}) {
    var windowDetails = windowState.get(windowId);

    // If we don't have any cached state on the window, save
    // what we know now and be done
    if(windowDetails === undefined) {
        windowState.set(windowId, {
            type: type,
            activeTab: (activeTab !== undefined) ? activeTab : -1,
            privacy: privacy
        });
        return;
    }

    // If the update has more information about the window type
    // than the cached window details, update the cached window
    // type
    if((type !== "unknown") &&
        ((windowDetails.type === "unknown") ||
        (type !== "normalorpopup") && (windowDetails.type === "normalorpopup")))
        windowDetails.type = type;

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
 * @property {string} url - The URL loaded in the tab.
 * @property {string} referrer - The referrer URL for the tab, or `""` if
 * there is no referrer.
 * @property {boolean} privateWindow - Whether the tab is in a private window.
 * @property {number} windowId - The ID of the window containing the tab.
 * @property {boolean} isWebContent - Whether the tab contains ordinary web
 * content (i.e., a URL starting with `"http://"` or `"https://"`).
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
 * @param {string} url - The URL loaded in the tab.
 * @param {string} referrer - The referrer URL for the tab, or `""` if
 * there is no referrer.
 * @param {string} privateWindow - Whether the tab is in a private
 * window.
 * @param {string} windowId - The ID of the window containing the tab.
 */
function updateTabState(tabId, url, referrer, privateWindow, windowId) {
    // If the URL parses successfully and has an HTTP or HTTPS protocol,
    // consider it web content
    var isWebContent;
    try {
        var parsedUrl = new URL(url);
        if((parsedUrl.protocol === "http:") || (parsedUrl.protocol === "https:"))
            isWebContent = true;
    }
    catch {
        isWebContent = false;
    }

    tabState.set(tabId, { url, referrer, privateWindow, windowId, isWebContent });
}

/**
 * @typedef {Object} WebRequestDetails
 * @property {string} url - The URL for the request.
 * @property {string} referrer - The value of the `Referer` HTTP header for
 * the request or `""` if there is no header.
 */

/**
 * A Map that tracks tab-level web requests. We need this cached state to match
 * referrers to page loads. The keys are tab IDs and the values are
 * WebRequestDetails objects.
 * @private
 * @const {Map<number,WebRequestDetails>}
 * @default
 */
const webRequestCache = new Map();

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
async function initialize() {
    if(initialized || initializing)
        return;
    initializing = true;

    // Configure event listeners
    // Note that we have to call Idle.registerIdleStateListener before we call
    // Idle.queryState, so this comes before caching the initial state

    // Handle tab-level web requests
    browser.webRequest.onBeforeSendHeaders.addListener(details => {
        // Ignore requests that aren't associated with browsing tabs
        if(details.tabId < 0)
            return;
        // Get the referrer URL from the request headers
        var referrer = "";
        for(const requestHeader of details.requestHeaders)
            if((requestHeader.name.toLowerCase() === "referer") && ("value" in requestHeader))
                referrer = requestHeader.value;
        webRequestCache.set(details.tabId, {
            url: details.url,
            referrer
        });
    }, {
        urls: [ "<all_urls>" ],
        types: [ "main_frame" ]
    },
    [ "requestHeaders" ]);

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
        var webRequestDetails;
        if((webRequestDetails = webRequestCache.get(tabId)) !== undefined) {
            if(webRequestDetails.url === changeInfo.url)
                referrer = webRequestDetails.referrer;
            webRequestCache.delete(tabId);
        }

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
        webRequestCache.delete(tabId);

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

        // Update the window state cache with the window's type and
        // privacy property
        updateWindowState(createdWindow.id, {
            type: ("type" in createdWindow) ? createdWindow.type : "unknown",
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
        // property and, since we know this is a browsing window based
        // on the tab ID, the "normalorpopup" window type
        // While we might now know this is the active tab in the window,
        // the tabs.onActivated event will separately fire
        updateWindowState(tab.windowId, {
            type: "normalorpopup",
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

        // If the new window is not a browser window, remember tab ID = -1 and window ID = -1,
        // and do not start a new attention span
        if((focusedWindowDetails.type !== "normal") && (focusedWindowDetails.type !== "popup") && (focusedWindowDetails.type !== "normalorpopup")) {
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
