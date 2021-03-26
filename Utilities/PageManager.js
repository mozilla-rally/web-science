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
 *     timestamped with the URL change in the WebNavigation API.
 *   * Page Visit Stop - The browser is unloading the webpage. Ordinarily this
 *     event fires and is timestamped with the `window` unload event. When the page
 *     changes via the History API, this event fires and is timestamped with the URL
 *     change in the WebNavigation API.
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
 * from the WebExtensions `tabs`, `windows`, and `idle` APIs.
 *
 * # Audio Events
 * In the content script environment, each page has an audio status, and an event fires
 * when that status changes. Audio update events fire and are timestamped with events
 * from the WebExtensions `tabs` API.
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
 *   * The background script sends update messages to tabs regardless of whether they
 *     are ordinary tabs or have the PageManager content script running, because the
 *     background script does not track window types or tab content. The errors
 *     generated by this issue are caught in `Messaging.sendMessageToTab`, and the
 *     issue should not cause any problems for studies.
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

// import browser from 'webextension-polyfill';

// FIXME unused
// import * as Debugging from './Debugging.js';
import * as Events from './Events.js';
import * as Idle from './Idle.js';
import * as Messaging from './Messaging.js';

// FIXME unused
// const debugLog = Debugging.getDebuggingLog('Utilities.PageManager');

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
 * @property {boolean} isHistoryChange - Whether the page visit was caused by a change via the History API.
 */

/**
 * A listener function for page visit start events.
 * @callback pageVisitStartListener
 * @param {PageVisitStartDetails} details - Additional information about the page visit start event.
 */

/**
 * Additional information about a page visit start event listener function.
 * @typedef {Object} PageVisitStartListenerOptions
 * @property {boolean} privateWindows - Whether to notify the listener function for events in private windows.
 */

/**
 * An event that is fired when a page visit starts.
 * @type {Events.Event<pageVisitStartListener, PageVisitStartListenerOptions>}
 * @const
 */
export const onPageVisitStart = new Events.Event({
    // Filter notifications for events in private windows
    notifyListenersCallback: (listener, [details], options) => {
        if (!details.privateWindow || (('privateWindows' in options) && options.privateWindows)) { return true; }
        return false;
    }
});

/**
 * Notify listeners for the page visit start event.
 * @param {PageVisitStartDetails} details - Additional information about the page visit start event.
 * @private
 */
function pageVisitStart(details) {
    onPageVisitStart.notifyListeners([details]);
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
 * @typedef {Object} PageVisitStopListenerOptions
 * @property {boolean} privateWindows - Whether to notify the listener function for events in private windows.
 */

/**
 * An event that is fired when a page visit starts.
 * @type {Events.Event<pageVisitStopListener, PageVisitStartListenerOptions>}
 * @const
 */
export const onPageVisitStop = new Events.Event({
    // Filter notifications for events in private windows
    notifyListenersCallback: (listener, [details], options) => {
        if (!details.privateWindow || (('privateWindows' in options) && options.privateWindows)) { return true; }
        return false;
    }
});

/**
 * Notify listeners for the page visit stop event.
 * @param {PageVisitStopDetails} details - Additional information about the page visit stop event.
 * @private
 */
function pageVisitStop(details) {
    onPageVisitStop.notifyListeners([details]);
}

/**
 * Notify a page that its attention state may have changed.
 * @private
 * @param {number} tabId - The tab containing the page, unique to the browsing session.
 * @param {boolean} pageHasAttention - Whether the tab containing the page has the user's
 * attention.
 * @param {number} [timeStamp=Date.now()] - The time when the underlying browser event fired.
 */
function sendPageAttentionUpdate(tabId, pageHasAttention, timeStamp = Date.now(), reason) {
    Messaging.sendMessageToTab(tabId, {
        type: 'WebScience.Utilities.PageManager.pageAttentionUpdate',
        pageHasAttention,
        timeStamp,
        reason
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

    if (windowDetails === undefined) {
        windowDetails = { activeTab: -1 };
        windowState.set(windowId, windowDetails);
    }

    if (activeTab !== undefined) { windowDetails.activeTab = activeTab; }
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
 * Configure message passing between the background script and content script, register browser
 * event handlers, cache initial state, and register the content script. Runs only once.
 * @private
 */
export async function initialize() {
    if (initialized || initializing) { return; }
    initializing = true;

    // Register message listeners and schemas for communicating with the content script

    // The content script sends a WebScience.Utilities.PageManger.pageVisitStart message when
    // there is a page visit start event
    Messaging.registerListener('WebScience.Utilities.PageManager.pageVisitStart', (pageVisitStartInfo, sender) => {
        // Notify the content script if it has attention
        // We can't send this message earlier (e.g., when the tab URL changes) because we need to know the content
        // script is ready to receive the message
        if (checkForAttention(sender.tab.id, sender.tab.windowId)) { sendPageAttentionUpdate(sender.tab.id, true, Date.now(), 'page-visit-start'); }

        pageVisitStart({
            pageId: pageVisitStartInfo.pageId,
            tabId: sender.tab.id,
            windowId: sender.tab.windowId,
            url: pageVisitStartInfo.url,
            referrer: pageVisitStartInfo.referrer,
            pageVisitStartTime: pageVisitStartInfo.timeStamp,
            privateWindow: pageVisitStartInfo.privateWindow,
            isHistoryChange: pageVisitStartInfo.isHistoryChange
        });
    }, {
        pageId: 'string',
        url: 'string',
        referrer: 'string',
        timeStamp: 'number',
        privateWindow: 'boolean',
        isHistoryChange: 'boolean'
    });

    // The content script sends a WebScience.Utilities.PageManger.pageVisitStop message when
    // there is a page visit stop event
    // We don't currently include tab or window information with the page visit stop event
    // because the sender object doesn't include that information when the tab is closing
    Messaging.registerListener('WebScience.Utilities.PageManager.pageVisitStop', (pageVisitStopInfo) => {
        pageVisitStop({
            pageId: pageVisitStopInfo.pageId,
            url: pageVisitStopInfo.url,
            referrer: pageVisitStopInfo.referrer,
            pageVisitStartTime: pageVisitStopInfo.timeStamp,
            pageVisitStopTime: pageVisitStopInfo.timeStamp,
            privateWindow: pageVisitStopInfo.privateWindow
        });
    }, {
        pageId: 'string',
        url: 'string',
        referrer: 'string',
        timeStamp: 'number',
        pageVisitStartTime: 'number',
        privateWindow: 'boolean'
    });

    // The background script sends a WebScience.Utilities.PageManager.pageAttentionUpdate message
    // when the attention state of the page may have changed
    Messaging.registerSchema('WebScience.Utilities.PageManager.pageAttentionUpdate', {
        timeStamp: 'number',
        pageHasAttention: 'boolean',
        // HAMILTON: added inboundAttentionReason
        reason: 'string'
    });

    // The background script sends a WebScience.Utilities.PageManager.urlChanged message when
    // the URL changes for a tab, indicating a possible page load with the History API
    Messaging.registerSchema('WebScience.Utilities.PageManager.urlChanged', {
        timeStamp: 'number'
    });

    // The background script sends a WebScience.Utilities.PageManager.pageAudioUpdate message
    // when the audio state of the page may have changed
    Messaging.registerSchema('WebScience.Utilities.PageManager.pageAudioUpdate', {
        pageHasAudio: 'boolean',
        timeStamp: 'number'
    });

    // Register background script event handlers

    // If a tab's audible state changed, send WebScience.Utilities.PageManager.pageAudioUpdate
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (!initialized) { return; }
        const timeStamp = Date.now();
        Messaging.sendMessageToTab(tabId, {
            type: 'WebScience.Utilities.PageManager.pageAudioUpdate',
            pageHasAudio: changeInfo.audible,
            timeStamp
        });
    }, {
        urls: ['http://*/*', 'https://*/*'],
        properties: ['audible']
    });

    // If a tab's URL changed because of the History API, send WebScience.Utilities.PageManager.urlChanged
    browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
        if (!initialized) { return; }
        const timeStamp = Date.now();

        Messaging.sendMessageToTab(details.tabId, {
            type: 'WebScience.Utilities.PageManager.urlChanged',
            timeStamp
        });
    }, {
        url: [{ schemes: ['http', 'https'] }]
    });

    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
        if (!initialized) { return; }

        // We don't have to update the window state here, because either there is
        // another tab in the window that will become active (and tabs.onActivated
        // will fire), or there is no other tab in the window so the window closes
        // (and windows.onRemoved will fire)

        // If this is the active tab, forget it
        if (currentActiveTab === tabId) { currentActiveTab = -1; }
    });

    // Handle when the active tab in a window changes
    browser.tabs.onActivated.addListener(activeInfo => {
        if (!initialized) { return; }
        const timeStamp = Date.now();

        // If this is a non-browser tab, ignore it
        if ((activeInfo.tabId === browser.tabs.TAB_ID_NONE) || (activeInfo.tabId < 0) ||
            (activeInfo.windowId < 0)) { return; }

        // Update the window state cache with the new
        // active tab ID
        updateWindowState(activeInfo.windowId, {
            activeTab: activeInfo.tabId
        });

        // If there isn't a focused window, or the tab update is not in the focused window, ignore it
        if ((currentFocusedWindow < 0) || (activeInfo.windowId != currentFocusedWindow)) { return; }

        // If the browser is active or (optionally) we are not considering user input,
        // notify the current page with attention that it no longer has attention, and notify
        // the new page with attention that is has attention
        if ((browserIsActive || !considerUserInputForAttention)) {
            if ((currentActiveTab >= 0) && (currentFocusedWindow >= 0)) { sendPageAttentionUpdate(currentActiveTab, false, timeStamp, 'tab-switched-away'); }
            sendPageAttentionUpdate(activeInfo.tabId, true, timeStamp, 'tab-switched-toward');
        }

        // Remember the new active tab
        currentActiveTab = activeInfo.tabId;
    });

    browser.windows.onRemoved.addListener(windowId => {
        if (!initialized) { return; }

        // If we have cached state for this window, drop it
        windowState.delete(windowId);
    });

    browser.windows.onFocusChanged.addListener(windowId => {
        if (!initialized) { return; }
        const timeStamp = Date.now();

        // If the browser is active or (optionally) we are not considering user input, and if
        // if there is an active tab in a focused window, notify the current page with attention
        // that it no longer has attention
        if ((browserIsActive || !considerUserInputForAttention) && ((currentActiveTab >= 0) && (currentFocusedWindow >= 0))) { sendPageAttentionUpdate(currentActiveTab, false, timeStamp, 'window-focus-lost'); }

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
        if (focusedWindowDetails === undefined) {
            currentActiveTab = -1;
            currentFocusedWindow = -1;
            return;
        }

        // Otherwise, remember the new active tab and focused window, and if the browser is active
        // or (optionally) we are not considering user input, notify the page in the tab that it
        // has attention
        currentActiveTab = focusedWindowDetails.activeTab;
        currentFocusedWindow = windowId;
        if (browserIsActive || !considerUserInputForAttention) { sendPageAttentionUpdate(currentActiveTab, true, timeStamp, 'window-focus-acquired'); }
    });

    // Handle when the browser activity state changes
    // This listener abstracts the browser activity state into two categories: active and inactive
    // Active means the user has recently provided input to the browser, inactive means any other
    // state (regardless of whether a screensaver or lock screen is enabled)

    // Note that we have to call Idle.registerIdleStateListener before we call
    // Idle.queryState, so this comes before caching the initial state
    if (considerUserInputForAttention) {
        await Idle.registerIdleStateListener(newState => {
            if (!initialized) { return; }
            const timeStamp = Date.now();

            // If the browser is not transitioning between active and inactive states, ignore the event
            if ((browserIsActive) === (newState === 'active')) { return; }

            // Remember the flipped browser activity state
            browserIsActive = !browserIsActive;

            // If there isn't an active tab in a focused window, we don't need to send attention events
            if ((currentActiveTab < 0) || (currentFocusedWindow < 0)) { return; }

            // Send an attention state change event to the current active tab, reflecting the browser activity state
            sendPageAttentionUpdate(currentActiveTab, browserIsActive, timeStamp, 'browser-idle');
        }, idleThreshold);
    }

    // Cache the initial idle, window, and tab state

    if (considerUserInputForAttention) { browserIsActive = (Idle.queryState(idleThreshold) === 'active'); }

    const openWindows = await browser.windows.getAll({
        populate: true
    });
    for (const openWindow of openWindows) {
        // If the window doesn't have a window ID, ignore it
        // This shouldn't happen, but checking anyway since
        // the id property is optional in the windows.Window
        // type
        if (!('id' in openWindow)) { continue; }
        // Iterate the tabs in the window to cache tab state
        // and find the active tab in the window
        let activeTabInOpenWindow = -1;
        if ('tabs' in openWindow) {
            for (const tab of openWindow.tabs) {
                if (tab.active) { activeTabInOpenWindow = tab.id; }
            }
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
        if (openWindow.focused) {
            currentFocusedWindow = openWindow.id;
            currentActiveTab = activeTabInOpenWindow;
        }
    }

    // FIXME we will roll this up soon.

    const contentScript =
        /**
              * Content script for the PageManager module. This module provides a `PageManager`
              * API with global scope in the content script environment. The API includes the
              * following features.
              *   * Page Tracking
              *     * `pageId` - A unique ID for the page.
              *     * `url` - The URL of the page, omitting any hash.
              *     * `referrer` - The referrer for the page.
              *   * Page Events
              *     * `onPageVisitStart` - An event that fires when a page visit begins. Note that
              *       the page visit start event may have already fired by the time another
              *       content script attaches (see discussion below).
              *     * `onPageVisitStop` - An event that fires when a page visit ends.
              *     * `onPageAttentionUpdate` - An event that fires when the page's attention state
              *     changes.
              *     * `onPageAudioUpdate` - An event that fires when the page's audio state changes.
              *   * Page Properties
              *     * `pageHasAttention` - Whether the page currently has the user's attention.
              *     * `pageHasAudio - Whether there is currently audio playing on the page.
              *     * `pageVisitStarted` - Whether the page visit start event has completed firing,
              *     such that all listeners have been notified.
              *     * `pageVisitStartTime` - The time that the page visit started.
              *
              * # Events
              * See the documentation in the PageManager module for detail on the event types.
              *
              * Each event implements the standard WebExtensions event features.
              *   * addListener
              *   * removeListener
              *   * hasListener
              *
              * Event listeners receive an object with the following property.
              *   * timeStamp - The time that the underlying browser event fired.
              *
              * Listeners for the page visit start event receive an object with the following
              * additional property.
              *   * isHistoryChange - Whether the page visit was caused by a change via the History API.
              *
              * Example usage:
              * ```
              * PageManager.onPageVisitStop.addListener(({timeStamp}) => {
              *     console.log(`Page visit stopped at ${timeStamp} with page ID ${PageManager.pageId}`);
              * });
              *
              * PageManager.onPageAttentionUpdate.addListener(({timeStamp}) => {
              *     console.log(`Page attention update at ${timeStamp} with attention state ${PageManager.pageHasAttention}.`);
              * });
              * ```
              *
              * # Content Script Load Ordering
              * ## Executing a Content Script After the PageManager API Has Loaded
              * Note that the WebExtensions content script model does not guarantee execution
              * order for content scripts, so it is possible that the API will not have loaded
              * when a content script that depends on the API loads. As a workaround, this
              * content script checks the global `pageManagerHasLoaded` for an array of
              * functions to call after the content script has executed, but before the content
              * script has fired the page visit start event.
              *
              * Example usage:
              * ```
              * function main() {
              *     // Content script logic goes here
              * }
              *
              * if("PageManager" in window)
              *     main();
              * else {
              *     if(!("pageManagerHasLoaded" in window))
              *         window.pageManagerHasLoaded = [];
              *     window.pageManagerHasLoaded.push(main);
              * }
              * ```
              *
              * ## Listening for the Page Visit Start Event
              * Because the order of content script execution is not guaranteed, a content
              * script that uses the PageManager API might miss a page visit start event. For
              * example, the PageManager content script might attach and fire the page visit
              * start event, then another content script attaches and begins listening for
              * the event. The PageManager API addresses this limitation by providing a
              * `pageVisitStarted` boolean reflecting whether the page visit start event has
              * already completed firing (i.e., all listeners have been notified). Content scripts
              * that use the page visit start event will commonly want to call their own page visit
              * start listener if `pageVisitStarted` is `true`.
              *
              * Example usage:
              * ```
              * function pageVisitStartListener({timeStamp}) {
              *     // Page visit start logic goes here
              * }
              * PageManager.onPageVisitStart.addListener(pageVisitStartListener);
              * if(PageManager.pageVisitStarted)
              *     pageVisitStartListener({ timeStamp: PageManager.pageVisitStartTime });
              * ```
              *
              * # Known Issues
              *   * When sending a page visit stop message to the background script, sometimes
              *     Firefox generates an error ("Promise resolved while context is inactive")
              *     because the content script execution environment is terminating while the
              *     message sending Promise remains open. This error does not affect functionality,
              *     because we do not depend on resolving the Promise (i.e., a response to the
              *     page visit stop message).
              * @module WebScience.Utilities.content-scripts.pageManager
              */
        // Tell eslint that PageManager isn't actually undefined
        /* global PageManager */

        // Function encapsulation to maintain content script isolation

        function () {
            // Check if the PageManager content script has already run on this page
            // If it has, bail out
            if ('PageManager' in window) { return; }

            // Construct a PageManager object on the `window` global
            // All the public PageManager functionality that is available in the content
            // script environment is exposed through this object
            window.PageManager = {};

            /**
              * Generate a page ID, a random 128-bit value represented as a hexadecimal string.
              * @private
              * @returns {string} The new page ID.
              */
            function generatePageId() {
                const pageIdBytes = window.crypto.getRandomValues(new Uint8Array(16));
                return Array.from(pageIdBytes, (byte) => {
                    if (byte < 16) { return '0' + byte.toString(16); }
                    return byte.toString(16);
                }).join('');
            }

            /**
               * Returns a copy of the URL string from `window.location.href`, without any
               * hash at the end. We canonicalize URLs without the hash because jumping
               * between parts of a page (as indicated by a hash) should not be considered page
               * navigation.
               * @returns {string}
               */
            function locationHrefWithoutHash() {
                return window.location.href.slice(-1 * window.location.hash.length);
            }

            /**
               * Log a debugging message to `console.debug` in a standardized format.
               * @param {string} message - The debugging message.
               */
            function debugLog(message) {
                // HAMILTON: commented this out.
                // console.debug(`WebScience.Utilities.PageManager (Content Script): ${message}`);
            }

            // Event management types and classes
            // This should be kept in sync with the Events module, removing only export statements

            /**
               * A class that provides an event API similar to WebExtensions `events.Event` objects.
               * @template EventCallbackFunction
               * @template EventOptions
               */
            class Event {
                /**
                     * Creates an event instance similar to WebExtensions `events.Event` objects.
                     * @param {EventOptions} [options] - A set of options for the event.
                     * @param {addListenerCallback} [options.addListenerCallback] - A function that is
                     * called when a listener function is added.
                     * @param {removeListenerCallback} [options.removeListenerCallback] - A function
                     * that is called when a listener function is removed.
                     * @param {notifyListenersCallback} [options.notifyListenersCallback] - A function
                     * that is called before a listener is notified and can filter the notification.
                     */
                constructor({
                    addListenerCallback = null,
                    removeListenerCallback = null,
                    notifyListenersCallback = null
                } = {
                        addListenerCallback: null,
                        removeListenerCallback: null,
                        notifyListenersCallback: null
                    }) {
                    this.addListenerCallback = addListenerCallback;
                    this.removeListenerCallback = removeListenerCallback;
                    this.notifyListenersCallback = notifyListenersCallback;
                    this.listeners = new Map();
                }

                /**
                     * A callback function that is called when a new listener function is added.
                     * @callback addListenerCallback
                     * @param {EventCallbackFunction} listener - The new listener function.
                     * @param {EventOptions} options - The options for the new listener function.
                     */

                /**
                     * A function that adds an event listener, with optional parameters. If the
                     * listener has previously been added for the event, the listener's options
                     * (if any) will be updated.
                     * @param {EventCallbackFunction} listener - The function to call when the event fires.
                     * @param {EventOptions} options - Options for when the listener should be called.
                     * The supported option(s) depend on the event type.
                     */
                addListener(listener, options) {
                    if (this.addListenerCallback !== null) { this.addListenerCallback(listener, options); }
                    this.listeners.set(listener, options);
                }

                /**
                     * A callback function that is called when a listener function is removed.
                     * @callback removeListenerCallback
                     * @param {EventCallbackFunction} listener - The listener function to remove.
                     */

                /**
                     * A function that removes an event listener.
                     * @param {EventCallbackFunction} listener - The listener function to remove.
                     */
                removeListener(listener) {
                    if (this.removeListenerCallback !== null) { this.removeListenerCallback(listener); }
                    this.listeners.delete(listener);
                }

                /**
                     * A function that checks whether an event listener has been added.
                     * @param {EventCallbackFunction} listener - The listener function to check.
                     * @return {boolean} Whether the listener function has been added.
                     */
                hasListener(listener) {
                    return this.listeners.has(listener);
                }

                /**
                     * A callback function that is called when a listener function may be notified.
                     * @callback notifyListenersCallback
                     * @param {EventCallbackFunction} listener - The listener function that may be called.
                     * @param {Array} listenerArguments - The arguments that would be passed to the listener
                     * function.
                     * @param {EventOptions} options - The options that the listener was added with.
                     * @return {boolean} Whether to call the listener function.
                     */

                /**
                     * Notify the listener functions for the event.
                     * @param {Array} [listenerArguments=[]] - The arguments that will be passed to listener
                     * functions.
                     */
                notifyListeners(listenerArguments = []) {
                    this.listeners.forEach((options, listener) => {
                        try {
                            if ((this.notifyListenersCallback === null) || this.notifyListenersCallback(listener, listenerArguments, options)) { listener.apply(null, listenerArguments); }
                        } catch (error) {
                            debugLog(`Error in content script listener notification: ${error}`);
                        }
                    });
                }
            }

            /**
               * An extension of the Event class that omits options when adding a listener.
               * @template EventCallbackFunction
               * @extends {Event<EventCallbackFunction, undefined>}
               */
            class EventWithoutOptions extends Event {
                /**
                     * @callback addListenerCallbackWithoutOptions
                     * @param {EventCallbackFunction} listener - The new listener function.
                     */

                /**
                     * Creates an event instance similar to WebExtensions `events.Event` objects.
                     * @param {EventOptions} [options] - A set of options for the event.
                     * @param {addListenerCallbackWithoutOptions} [options.addListenerCallback] - A function that is
                     * called when a listener function is added.
                     * @param {removeListenerCallback} [options.removeListenerCallback] - A function
                     * that is called when a listener function is removed.
                     * @param {notifyListenersCallback} [options.notifyListenersCallback] - A function
                     * that is called before a listener is notified and can filter the notification.
                     */
                constructor({
                    addListenerCallback = null,
                    removeListenerCallback = null,
                    notifyListenersCallback = null
                } = {
                        addListenerCallback: null,
                        removeListenerCallback: null,
                        notifyListenersCallback: null
                    }) {
                    super({ addListenerCallback, removeListenerCallback, notifyListenersCallback });
                }

                /**
                     * A function that adds an event listener.
                     * @param {EventCallbackFunction} listener - The function to call when the event fires.
                     */
                addListener(listener) {
                    super.addListener(listener, undefined);
                }
            }

            /**
               * Additional information about an event, containing only a time stamp.
               * @typedef {Object} TimeStampDetails
               * @property {number} timeStamp - The time when the underlying event occurred.
               */

            /**
               * A callback function with a time stamp parameter.
               * @callback callbackWithTimeStamp
               * @param {TimeStampDetails} details - Additional information about the event.
               */

            /**
               * Additional information about a page visit start event.
               * @typedef {Object} PageVisitStartDetails
               * @property {number} timeStamp - The time when the underlying event occurred.
               * @property {boolean} isHistoryChange - Whether the page visit was caused by a change via the History API.
               */

            /**
               * A callback function for the page visit start event.
               * @callback pageVisitStartCallback
               * @param {PageVisitStartDetails} details - Additional information about the event.
               */

            /**
               * An event that is fired when a page visit starts.
               * @type {EventWithoutOptions<pageVisitStartCallback>}
               */
            PageManager.onPageVisitStart = new EventWithoutOptions();

            /**
               * An event that is fired when a page visit stops.
               * @type {EventWithoutOptions<callbackWithTimeStamp>}
               */
            PageManager.onPageVisitStop = new EventWithoutOptions();

            /**
               * An event that is fired when the page attention state changes.
               * @type {EventWithoutOptions<callbackWithTimeStamp>}
               */
            PageManager.onPageAttentionUpdate = new EventWithoutOptions();

            /**
               * An event that is fired when the page attention state changes.
               * @type {EventWithoutOptions<callbackWithTimeStamp>}
               */
            PageManager.onPageAudioUpdate = new EventWithoutOptions();

            /**
               * Send a message to the background page, with a catch because errors can
               * occur in `browser.runtime.sendMessage` when the page is unlooading.
               * @param {object} message - The message to send, which should be an object with
               * a type string.
               */
            PageManager.sendMessage = function (message) {
                try {
                    browser.runtime.sendMessage(message).catch((reason) => {
                        debugLog(`Error when sending message from content script to background page: ${JSON.stringify(message)}`);
                    });
                } catch (error) {
                    debugLog(`Error when sending message from content script to background page: ${JSON.stringify(message)}`);
                }
            };

            /**
               * The function for firing the page visit start event, which runs whenever a new page
               * loads. A page load might be because of ordinary web navigation (i.e., loading a new
               * HTML document with a base HTTP(S) request) or because the URL changed via the History
               * API.
               * @private
               * @param {number} timeStamp - The time when the underlying event fired.
               * @param {boolean} [isHistoryChange=false] - Whether this page load was caused by the
               * History API.
               */
            function pageVisitStart(timeStamp, isHistoryChange = false) {
                // Assign a new page ID
                PageManager.pageId = generatePageId();
                // Store a copy of the URL, because we use it to check for History API page loads
                PageManager.url = locationHrefWithoutHash();
                // Store a copy of the referrer for convenience
                PageManager.referrer = document.referrer.repeat(1);
                PageManager.pageVisitStartTime = timeStamp;
                // If this is a History API page load, persist the states for attention and audio
                PageManager.pageHasAttention = isHistoryChange ? PageManager.pageHasAttention : false;
                PageManager.pageHasAudio = isHistoryChange ? PageManager.pageHasAudio : false;
                // Store whether the page visit event has completed firing
                PageManager.pageVisitStarted = false;

                // Send the page visit start event to the background page
                PageManager.sendMessage({
                    type: 'WebScience.Utilities.PageManager.pageVisitStart',
                    pageId: PageManager.pageId,
                    url: PageManager.url,
                    referrer: PageManager.referrer,
                    timeStamp: PageManager.pageVisitStartTime,
                    privateWindow: browser.extension.inIncognitoContext,
                    isHistoryChange
                });

                // Notify the page visit start event listeners in the content script environment
                PageManager.onPageVisitStart.notifyListeners([{
                    timeStamp,
                    isHistoryChange
                }]);

                PageManager.pageVisitStarted = true;

                debugLog(`Page visit start: ${JSON.stringify(PageManager)}`);
            }

            /**
               * The function for firing the page visit stop event, which runs whenever a page closes.
               * That could be because of browser exit, tab closing, tab navigation to a new page, or
               * a new page loading via the History API.
               * @private
               * @param {number} timeStamp - The time when the underlying event fired.
               */
            function pageVisitStop(timeStamp) {
                // Send the page visit stop event to the background page
                PageManager.sendMessage({
                    type: 'WebScience.Utilities.PageManager.pageVisitStop',
                    pageId: PageManager.pageId,
                    url: PageManager.url,
                    referrer: PageManager.referrer,
                    timeStamp,
                    pageVisitStartTime: PageManager.pageVisitStartTime,
                    privateWindow: browser.extension.inIncognitoContext
                });

                // Notify the page visit stop event listeners in the content script environment
                PageManager.onPageVisitStop.notifyListeners([{
                    timeStamp
                }]);

                debugLog(`Page visit stop: ${JSON.stringify(PageManager)}`);
            }

            /**
               * The function for firing the page attention update event, which runs whenever the
               * page attention state might have changed. The function contains logic to verify
               * that the attention state actually changed before firing the event.
               * @param {number} timeStamp - The time when the underlying event fired.
               * @param {boolean} pageHasAttention - The latest attention state, according to the
               * PageManager module running in the background page.
               */
            function pageAttentionUpdate(timeStamp, pageHasAttention, reason) {
                if (PageManager.pageHasAttention === pageHasAttention) { return; }

                PageManager.pageHasAttention = pageHasAttention;

                // Notify the page attention update event listeners in the content script environment
                PageManager.onPageAttentionUpdate.notifyListeners([{
                    timeStamp, reason
                }]);

                debugLog(`Page attention update: ${JSON.stringify(PageManager)}`);
            }

            /**
               * The function for firing the page audio update event, which runs whenever the
               * page audio state might have changed. The function contains logic to verify
               * that the audio state actually changed before firing the event.
               * @param {number} timeStamp - The time when the underlying event fired.
               * @param {boolean} pageHasAudio - The latest audio state, according to the
               * PageManager module running in the background page.
               */
            function pageAudioUpdate(timeStamp, pageHasAudio) {
                if (PageManager.pageHasAudio === pageHasAudio) { return; }

                PageManager.pageHasAudio = pageHasAudio;

                // Notify the page audio update event listeners in the content script environment
                PageManager.onPageAudioUpdate.notifyListeners([{
                    timeStamp, pageHasAudio
                }]);

                debugLog(`Page audio update: ${JSON.stringify(PageManager)}`);
            }

            // Handle events sent from the background page
            browser.runtime.onMessage.addListener((message) => {
                if (message.type === 'WebScience.Utilities.PageManager.pageAttentionUpdate') {
                    pageAttentionUpdate(message.timeStamp, message.pageHasAttention, message.reason);
                    return;
                }

                // If the background page detected a URL change, this could be belated
                // notification about a conventional navigation or it could be a page
                // load via the History API
                // We can distinguish these two scenarios by checking whether the URL
                // visible to the user (`window.location.href`) has changed since the
                // page visit start
                if ((message.type === 'WebScience.Utilities.PageManager.urlChanged') &&
                    (locationHrefWithoutHash() !== PageManager.url)) {
                    pageVisitStop(message.timeStamp);
                    pageVisitStart(message.timeStamp, true);
                    return;
                }

                if (message.type === 'WebScience.Utilities.PageManager.pageAudioUpdate') {
                    pageAudioUpdate(message.timeStamp, message.pageHasAudio);
                }
            });

            // If there are any other content scripts that are waiting for the API to load,
            // execute the callbacks for those content scripts
            if ('pageManagerHasLoaded' in window) {
                if (Array.isArray(window.pageManagerHasLoaded)) {
                    for (const callback of window.pageManagerHasLoaded) {
                        if (typeof callback === 'function') {
                            try {
                                callback();
                            } catch (error) {
                                debugLog(`Error in callback for PageManager load: ${error}`);
                            }
                        }
                    }
                }
                delete window.pageManagerHasLoaded;
            }

            // Send the page visit start event for the first time
            pageVisitStart(Math.floor(window.performance.timeOrigin));

            // Send the page visit stop event on the window unload event
            window.addEventListener('unload', (event) => {
                pageVisitStop(Date.now());
            });
        };
    // Register the PageManager content script for all HTTP(S) URLs
    console.debug('loading content script');
    browser.contentScripts.register({
        matches: ['http://*/*', 'https://*/*'],
        js: [{
            code: `(${contentScript})()`
        }],
        runAt: 'document_start'
    });

    initializing = false;
    initialized = true;
}
