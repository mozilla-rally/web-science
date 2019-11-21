// Support for registering and notifying listeners on page attention start
// The listener receives the following parameters:
//   * tabId - unique to the browsing session
//   * windowId - unique to the browsing session, note that tabs can
//                subsequently move between windows
//   * timeStamp - the time when the underlying browser event fired

var pageAttentionStartListeners = [ ];

export async function registerPageAttentionStartListener(pageAttentionStartListener, notifyAboutCurrentPageAttention = true) {
    initialize();
    pageAttentionStartListeners.push(pageAttentionStartListener);
    if(notifyAboutCurrentPageAttention)
        notifyPageAttentionStartListenerAboutCurrentPageAttention(pageAttentionStartListener);
}

function notifyPageAttentionStartListeners(tabId, windowId, url, timeStamp) {
    for (const pageAttentionStartListener of pageAttentionStartListeners)
        pageAttentionStartListener(tabId, windowId, timeStamp);
}

// Support for registering and notifying listeners on page visit stop
// The listener receives the following parameters:
//   * tabId - unique to the browsing session
//   * windowId - unique to the browsing session, note that tabs can
//                subsequently move between windows
//   * timeStamp - the time when the underlying browser event fired

var pageAttentionStopListeners = [ ];

export function registerPageAttentionStopListener(pageAttentionStopListener) {
    initialize();
    pageAttentionStopListeners.push(pageAttentionStopListener);
}

function notifypageAttentionStopListeners(tabId, windowId, timeStamp) {
    for (const pageAttentionStopListener of pageAttentionStopListeners)
        pageAttentionStopListener(tabId, windowId, timeStamp);
}

// Keep track of the currently focused window and active tab, and functions
// for checking against those values

var currentFocusedWindow = -1;
var currentActiveTab = -1;

export function checkTabAndWindowHaveAttention(tabId, windowId) {
    return ((currentActiveTab == tabId) && (currentFocusedWindow == windowId));
}

export function checkWindowHasAttention(windowId) {
    return (currentFocusedWindow == windowId);
}

// First run function that sets up browser event handlers

var initialized = false;

function initialize() {
    if(initialized)
        return;
    initialized = true;

    // Handle when the webpage in a tab changes, since the user attention might be
    // on that tab
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

        // Ignore changes that don't involve the URL
        if (!("url" in changeInfo))
            return;

        // If the user's attention is currently on this tab, end the attention span
        var userAttentionOnTab = checkTabAndWindowHaveAttention(tabId, tab.windowId);
        if (userAttentionOnTab)
            stopAttentionSpan(false);

        // If the user's attention is currently on this tab, start an attention span
        if (userAttentionOnTab)
            startAttentionSpan(tabId, tab.windowId);
    });

    // Check when the user closes a tab, because the page loaded in the tab might
    // have attention and a matching domain
    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
        if (checkTabAndWindowHaveAttention(tabId, removeInfo.windowId))
            stopAttentionSpan(true);
        stopPageVisit(tabId);
    });

    // Check when the user activates a tab, because the user might be changing
    // attention from or to a tab containing a webpage with a matching domain
    browser.tabs.onActivated.addListener(activeInfo => {
        // If this is a non-browser tab, ignore it
        if (activeInfo.tabId == browser.tabs.TAB_ID_NONE)
            return;

        // If the tab update is not in the focused window, ignore it
        if (!checkWindowHasAttention(activeInfo.windowId))
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
        catch (error) {
        }

        // Handle if all windows have lost focus or the focused window isn't a browser window
        // Note that we're using -1 as a placeholder for an untracked tab and/or window ID
        // This isn't necessary, but it improves the readability of debugging by
        // ensuring that every attention span has a start and an end
        if ((windowId == browser.windows.WINDOW_ID_NONE) || (windowDetails.type != "normal")) {
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

// Notifies a listener about the current page with attention, useful for when the extension
// launches in the middle of a browsing session

async function notifyPageAttentionStartListenerAboutCurrentPageAttention(pageAttentionStartListener) {

    // Get the current set of open tabs
    var activeTabInCurrentWindow = await browser.tabs.query({
        windowId: browser.windows.WINDOW_ID_CURRENT,
        active: true,
        windowType: "normal",
        url: [ "http://*/*", "https://*/*" ]
    });

    // Notify the listener
    if (activeTabInCurrentWindow.length > 0)
        pageAttentionStartListener(activeTabInCurrentWindow[0].id, activeTabInCurrentWindow[0].windowId);

}
