/**
 * ## Overview
 * This module addresses several challenges for studying user engagement with web content.
 *   * __Syncing Measurements and Interventions.__ A study that uses `WebScience` will
 *     often involve multiple measurements or interventions on a webpage. The
 *     `pageManager` module enables studies to sync these measurements and interventions
 *     by assigning a random unique identifier to each webpage.
 *   * __Generating Page Lifecycle Events.__ Measurements and interventions are often
 *     linked to specific events in the webpage lifecyle. The `pageManager` module
 *     standardizes a set of webpage lifecycle events.
 *   * __Tracking User Attention.__ Measurements and interventions often depend on user
 *     attention to web content. The `pageManager` module provides a standardized
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
 * ## Pages
 * This module creates an abstraction over webpages as perceived by users (i.e., when
 * content loads with a new HTTP(S) URL in the browser bar or the page visibly reloads).
 * Note that the History API enables web content to modify the URL without loading a new
 * HTML document via HTTP(S) or creating a new Document object. This module treats
 * a URL change via the History API as equivalent to traditional webpage navigation,
 * because (by design) it appears identical to the user. Accounting for the History
 * API is important, because it is used on some exceptionally popular websites (e.g.,
 * YouTube).
 *
 * ## Page IDs
 * Each page ID is a random (v4) UUID, consistent with RFC4122.
 *
 * ## Page Lifecycle
 * Each webpage has the following lifecycle events, which fire in both the background
 * page and content script environments.
 *   * Page Visit Start - The browser has started to load a webpage in a tab. This
 *     event is fired early in context script execution (i.e., soon after
 *     `document_start`). For a webpage with a new Document, the event is
 *     timestamped with the time the `window` object was created (the time origin
 *     from the High Resolution Time Level 2 API, in ms). For a webpage that does not
 *     have a new Document (i.e., resulting from the History API), the event is
 *     timestamped with the URL change in the WebNavigation API.
 *   * Page Visit Stop - The browser is unloading the webpage. Ordinarily this
 *     event fires and is timestamped with the `window` unload event. When the page
 *     changes via the History API, this event fires and is timestamped with the URL
 *     change in the WebNavigation API.
 *
 * ## Attention Tracking
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
 * from the WebExtensions `tabs`, `windows`, and `idle` APIs.
 *
 * ## Audio Events
 * In the content script environment, each page has an audio status, and an event fires
 * when that status changes. Audio update events fire and are timestamped with events
 * from the WebExtensions `tabs` API.
 *
 * ## Event Ordering
 * This module guarantees the ordering of page lifecycle, attention, and audio events.
 *   * Page visit start and page visit stop only fire once for each page, in that order.
 *   * Page attention and audio update events will only occur between page visit start
 *     and stop events.
 *
 * ## Additional Implementation Notes
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
 * module will detect that with the windows API and fire a page attention event (if needed).
 *
 * Some implementation quirks to be aware of for future development on this module:
 *   * Non-browser windows do not appear in the results of `windows.getAll()`, and calling
 *     `windows.get()` on a non-browser window throws an error. Switching focus to a non-
 *     browser window will, however, fire the `windows.onFocusChanged` event. The module
 *     assumes that if `windows.onFocusChanged` fires with an unknown window, that window
 *     is a non-browser window.
 *   * The module assumes that valid tab IDs and window IDs are always >= 0.
 *
 * ## Known Issues
 *   * The background script sends update messages to tabs regardless of whether they
 *     are ordinary tabs or have the pageManager content script running, because the
 *     background script does not track window types or tab content. The errors
 *     generated by this issue are caught in `messaging.sendMessageToTab`, and the
 *     issue should not cause any problems for studies.
 *
 * ## Possible Improvements
 *   * Rebuild a page attention update event in the background page environment.
 *   * Rebuild the capability to fire events for pages that are already open when the module
 *     loads.
 *   * Add logic to handle the situation where the content script execution environment crashes,
 *     so the page visit stop message doesn't fire from the associated content script.
 *   * Add an event in the content script for detecting when content has lazily loaded into the
 *     DOM after the various DOM loading events (e.g., on Twitter).
 * 
 * @module pageManager
 */

import * as events from "./events.js";
import * as idle from "./idle.js";
import * as messaging from "./messaging.js";
import * as inline from "./inline.js";
import * as permissions from "./permissions.js";
import * as timing from "./timing.js";
import pageManagerContentScript from "./content-scripts/pageManager.content.js";

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
 * A listener for the `onPageVisitStart` event.
 * @callback pageVisitStartListener
 * @memberof module:pageManager.onPageVisitStart
 * @param {Object} details - Additional information about the page visit start event.
 * @param {string} details.pageId - The ID for the page, unique across browsing sessions.
 * @param {number} details.tabId - The ID for the tab containing the page, unique to the browsing session. Note that if
 * you send a message to the content script in the tab, there is a possible race condition where the page in 
 * the tab changes before your message arrives. You should specify a page ID (e.g., `pageId`) in your message to
 * the content script, and the content script should check that page ID against its current page ID to ensure that
 * the message was received by the intended page.
 * @param {number} details.windowId - The ID for the window containing the page, unique to the browsing session.
 * Note that tabs can subsequently move between windows.
 * @param {string} details.url - The URL of the page loading in the tab, without any hash.
 * @param {string} details.referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @param {number} details.pageVisitStartTime - The time when the underlying event fired.
 * @param {boolean} details.privateWindow - Whether the page is in a private window.
 * @param {boolean} details.isHistoryChange - Whether the page visit was caused by a change via the History API.
 */

/**
 * Add a listener for the `onPageVisitStart` event.
 * @function addListener
 * @memberof module:pageManager.onPageVisitStart
 * @param {pageVisitStartListener} listener - The listener to add.
 * @param {Object} options - Options for the listener.
 * @param {boolean} [options.privateWindows=false] - Whether to notify the listener for events in private windows.
 */

/**
 * Remove a listener for the `onPageVisitStart` event.
 * @function removeListener
 * @memberof module:pageManager.onPageVisitStart
 * @param {pageVisitStartListener} listener - The listener to remove.
 */

/**
 * Whether a specified listener has been added for the `onPageVisitStart` event.
 * @function hasListener
 * @memberof module:pageManager.onPageVisitStart
 * @param {pageVisitStartListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * Whether the `onPageVisitStart` event has any listeners.
 * @function hasAnyListeners
 * @memberof module:pageManager.onPageVisitStart
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * An event that is fired in the background script environment when a page visit starts
 * in the content script environment.
 * @namespace
 */
export const onPageVisitStart = events.createEvent({
    name: "webScience.pageManager.onPageVisitStart",
    // Make sure the module is initialized when a listener is added
    addListenerCallback: listener => initialize(),
    // Filter notifications for events in private windows
    notifyListenersCallback: (listener, [ details ], options) => {
        if(!details.privateWindow || (("privateWindows" in options) && options.privateWindows))
            return true;
        return false;
    }
});

/**
 * A listener for the `onPageVisitStop` event.
 * @callback pageVisitStopListener
 * @memberof module:pageManager.onPageVisitStop
 * @param {Object} details - Additional information about the page visit stop event.
 * @param {string} details.pageId - The ID for the page, unique across browsing sessions.
 * @param {string} details.url - The URL of the page loading in the tab, without any hash.
 * @param {string} details.referrer - The referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @param {number} details.pageVisitStartTime - The time when the page visit started.
 * @param {number} details.pageVisitStopTime - The time when the underlying event fired.
 * @param {boolean} details.privateWindow - Whether the page is in a private window.
 */

/**
 * Add a listener for the `onPageVisitStop` event.
 * @function addListener
 * @memberof module:pageManager.onPageVisitStop
 * @param {pageVisitStopListener} listener - The listener to add.
 * @param {Object} options - Options for the listener.
 * @param {boolean} privateWindows - Whether to notify the listener for events in private windows.
 */

/**
 * Remove a listener for the `onPageVisitStop` event.
 * @function removeListener
 * @memberof module:pageManager.onPageVisitStop
 * @param {pageVisitStopListener} listener - The listener to remove.
 */

/**
 * Whether a specified listener has been added for the `onPageVisitStop` event.
 * @function hasListener
 * @memberof module:pageManager.onPageVisitStop
 * @param {pageVisitStopListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * Whether the `onPageVisitStop` event has any listeners.
 * @function hasAnyListeners
 * @memberof module:pageManager.onPageVisitStop
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * An event that is fired in the background script environment when a page visit stops
 * in the content script environment.
 * @namespace
 */
export const onPageVisitStop = events.createEvent({
    name: "webScience.pageManager.onPageVisitStop",
    // Make sure the module is initialized when a listener is added
    addListenerCallback: listener => initialize(),
    // Filter notifications for events in private windows
    notifyListenersCallback: (listener, [ details ], options) => {
        if(!details.privateWindow || (("privateWindows" in options) && options.privateWindows))
            return true;
        return false;
    }
});

/**
 * Notify a page that its attention state may have changed.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {boolean} pageHasAttention - Whether the tab containing the page has the user's
 * attention.
 * @param {number} [timeStamp=timing.now()] - The time when the underlying browser event fired.
 */
function sendPageAttentionUpdate(tabId, pageHasAttention, timeStamp = timing.now()) {
    messaging.sendMessageToTab(tabId, {
        type: "webScience.pageManager.pageAttentionUpdate",
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
let currentActiveTab = -1;

/**
 * The currently focused browsing window. Has the value -1 if there is no such window.
 * @private
 * @type {number}
 * @default
 */
let currentFocusedWindow = -1;

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
 * @private
 */

/**
 * A Map that tracks the current state of browser windows. We need this cached
 * state to avoid asynchronous queries when the focused window changes. The
 * keys are window IDs and the values are WindowDetails objects.
 * @private
 * @constant {Map<number,WindowDetails>}
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

    if(activeTab !== undefined) {
        windowDetails.activeTab = activeTab;
    }
}

/**
 * Whether the browser is active or idle. Ignored if the module is configured to
 * not consider user input when determining the attention state.
 * @private
 * @type {boolean}
 * @default
 */
let browserIsActive = false;

/**
 * Whether the module is in the process of configuring browser event handlers
 * and caching initial state.
 * @private
 * @type {boolean}
 */
let initializing = false;

/**
 * Whether the module has started configuring browser event handlers and caching
 * initial state.
 * @private
 * @type {boolean}
 */
let initialized = false;

/**
 * Initialize `pageManager` in the background and content script environments. If you are using
 * `pageManager` events in content scripts but not background scripts, you must call this function.
 * If you are using `pageManager` events in background scripts, this function is automatically called
 * when adding a listener for an event. This function configures message passing between the
 * `pageManager` background script and content script, registers browser event handlers, caches
 * initial state, and registers the `pageManager` content script. It runs only once.
 */
export async function initialize() {
    if(initialized || initializing) {
        return;
    }
    initializing = true;

    permissions.check({
        module: "webScience.pageManager",
        requiredPermissions: [ "webNavigation" ],
        suggestedOrigins: [ "<all_urls>" ]
    });

    // Register message listeners and schemas for communicating with the content script

    // The content script sends a webScience.pageManger.pageVisitStart message when
    // there is a page visit start event
    messaging.onMessage.addListener((pageVisitStartInfo, sender) => {
        // Notify the content script if it has attention
        // We can't send this message earlier (e.g., when the tab URL changes) because we need to know the content
        // script is ready to receive the message
        if(checkForAttention(sender.tab.id, sender.tab.windowId)) {
            sendPageAttentionUpdate(sender.tab.id, true, timing.now());
        }

        onPageVisitStart.notifyListeners([{
            pageId: pageVisitStartInfo.pageId,
            tabId: sender.tab.id,
            windowId: sender.tab.windowId,
            url: pageVisitStartInfo.url,
            referrer: pageVisitStartInfo.referrer,
            pageVisitStartTime: pageVisitStartInfo.timeStamp,
            privateWindow: pageVisitStartInfo.privateWindow,
            isHistoryChange: pageVisitStartInfo.isHistoryChange
        }]);
    }, {
        type: "webScience.pageManager.pageVisitStart",
        schema: {
            pageId: "string",
            url: "string",
            referrer: "string",
            timeStamp: "number",
            privateWindow: "boolean",
            isHistoryChange: "boolean"
        }
    });

    // The content script sends a webScience.pageManger.pageVisitStop message when
    // there is a page visit stop event
    // We don't currently include tab or window information with the page visit stop event
    // because the sender object doesn't include that information when the tab is closing
    messaging.onMessage.addListener((pageVisitStopInfo) => {
        onPageVisitStop.notifyListeners([{
            pageId: pageVisitStopInfo.pageId,
            url: pageVisitStopInfo.url,
            referrer: pageVisitStopInfo.referrer,
            pageVisitStartTime: pageVisitStopInfo.timeStamp,
            pageVisitStopTime: pageVisitStopInfo.timeStamp,
            privateWindow: pageVisitStopInfo.privateWindow
        }]);
    }, {
        type: "webScience.pageManager.pageVisitStop",
        schema: {
            pageId: "string",
            url: "string",
            referrer: "string",
            timeStamp: "number",
            pageVisitStartTime: "number",
            privateWindow: "boolean"
        }
    });

    // The background script sends a webScience.pageManager.pageAttentionUpdate message
    // when the attention state of the page may have changed
    messaging.registerSchema("webScience.pageManager.pageAttentionUpdate", {
        timeStamp: "number",
        pageHasAttention: "boolean"
    });

    // The background script sends a webScience.pageManager.urlChanged message when
    // the URL changes for a tab, indicating a possible page load with the History API
    messaging.registerSchema("webScience.pageManager.urlChanged", {
        url: "string",
        timeStamp: "number",
        webNavigationTimeStamp: "number"
    });

    // The background script sends a webScience.pageManager.pageAudioUpdate message
    // when the audio state of the page may have changed
    messaging.registerSchema("webScience.pageManager.pageAudioUpdate", {
        pageHasAudio: "boolean",
        timeStamp: "number"
    });

    // Register background script event handlers

    // If a tab's audible state changed, send webScience.pageManager.pageAudioUpdate
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if(!initialized) {
            return;
        }

        messaging.sendMessageToTab(tabId, {
            type: "webScience.pageManager.pageAudioUpdate",
            pageHasAudio: changeInfo.audible,
            timeStamp: timing.now()
        });
    }, {
        urls: [ "http://*/*", "https://*/*" ],
        properties: [ "audible" ]
    });

    // If a tab's URL changed because of the History API, send webScience.pageManager.urlChanged
    browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
        if(!initialized) {
            return;
        }
        if(details.frameId !== 0) {
            return;
        }

        messaging.sendMessageToTab(details.tabId, {
            type: "webScience.pageManager.urlChanged",
            url: details.url,
            timeStamp: timing.now(),
            // We can use details.timeStamp because, contrary to the MDN and Chrome documentation,
            // the timestamp is for the history API change rather than when the navigation was
            // committed. See: https://github.com/mdn/content/issues/4469
            webNavigationTimeStamp: details.timeStamp
        });
    }, {
        url: [ { schemes: [ "http", "https" ] } ]
    });

    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
        if(!initialized) {
            return;
        }

        // We don't have to update the window state here, because either there is
        // another tab in the window that will become active (and tabs.onActivated
        // will fire), or there is no other tab in the window so the window closes
        // (and windows.onRemoved will fire)

        // If this is the active tab, forget it
        if(currentActiveTab === tabId) {
            currentActiveTab = -1;
        }
    });

    // Handle when the active tab in a window changes
    browser.tabs.onActivated.addListener(activeInfo => {
        if(!initialized) {
            return;
        }
        const timeStamp = timing.now();

        // If this is a non-browser tab, ignore it
        if((activeInfo.tabId === browser.tabs.TAB_ID_NONE) ||
           (activeInfo.tabId < 0) ||
           (activeInfo.windowId < 0)) {
            return;
        }

        // Update the window state cache with the new
        // active tab ID
        updateWindowState(activeInfo.windowId, {
            activeTab: activeInfo.tabId
        });

        // If there isn't a focused window, or the tab update is not in the focused window, ignore it
        if((currentFocusedWindow < 0) || (activeInfo.windowId != currentFocusedWindow)) {
            return;
        }

        // If the browser is active or (optionally) we are not considering user input,
        // notify the current page with attention that it no longer has attention, and notify
        // the new page with attention that is has attention
        if((browserIsActive || !considerUserInputForAttention)) {
            if((currentActiveTab >= 0) && (currentFocusedWindow >= 0)) {
                sendPageAttentionUpdate(currentActiveTab, false, timeStamp);
            }
            sendPageAttentionUpdate(activeInfo.tabId, true, timeStamp);
        }

        // Remember the new active tab
        currentActiveTab = activeInfo.tabId;
    });

    browser.windows.onRemoved.addListener(windowId => {
        if(!initialized) {
            return;
        }

        // If we have cached state for this window, drop it
        windowState.delete(windowId);
    });

    browser.windows.onFocusChanged.addListener(windowId => {
        if(!initialized) {
            return;
        }
        const timeStamp = timing.now();

        // If the browser is active or (optionally) we are not considering user input, and if
        // if there is an active tab in a focused window, notify the current page with attention
        // that it no longer has attention
        if((browserIsActive || !considerUserInputForAttention) && ((currentActiveTab >= 0) && (currentFocusedWindow >= 0))) {
            sendPageAttentionUpdate(currentActiveTab, false, timeStamp);
        }

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
        const focusedWindowDetails = windowState.get(windowId);

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
        if(browserIsActive || !considerUserInputForAttention) {
            sendPageAttentionUpdate(currentActiveTab, true, timeStamp);
        }
    });

    // Handle when the browser activity state changes
    // This listener abstracts the browser activity state into two categories: active and inactive
    // Active means the user has recently provided input to the browser, inactive means any other
    // state (regardless of whether a screensaver or lock screen is enabled)

    // Note that we have to call idle.onStateChanged.addListener before we call
    // idle.queryState, so this comes before caching the initial state
    if(considerUserInputForAttention) {
        idle.onStateChanged.addListener(newState => {
            if(!initialized) {
                return;
            }
            const timeStamp = timing.now();

            // If the browser is not transitioning between active and inactive states, ignore the event
            if((browserIsActive) === (newState === "active")) {
                return;
            }

            // Remember the flipped browser activity state
            browserIsActive = !browserIsActive;

            // If there isn't an active tab in a focused window, we don't need to send attention events
            if((currentActiveTab < 0) || (currentFocusedWindow < 0)) {
                return;
            }

            // Send an attention state change event to the current active tab, reflecting the browser activity state
            sendPageAttentionUpdate(currentActiveTab, browserIsActive, timeStamp);
        }, idleThreshold);
    }

    // Cache the initial idle, window, and tab state

    if(considerUserInputForAttention)
        browserIsActive = (idle.queryState(idleThreshold) === "active");

    const openWindows = await browser.windows.getAll({
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
        let activeTabInOpenWindow = -1;
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

    // Register the pageManager content script for all URLs permitted by the extension manifest
    browser.contentScripts.register({
        matches: permissions.getManifestOriginMatchPatterns(),
        js: [{
            code: inline.dataUrlToString(pageManagerContentScript)
        }],
        runAt: "document_start"
    });

    initializing = false;
    initialized = true;
}
