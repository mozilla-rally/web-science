/* user actions:
 *   - switch tabs within same window
 *     - easy to catch with onActivated
 *     - set currentTabId variable
 *   - open a new tab
 *     - don't really need to do anything
 *   - change the url of an existing tab
 *     - catch with careful reading of onUpdated
 *     - set currentTabId for new URL
 *   - open a new window or switch windows
 *     - easy to catch with windows.onFocusChanged
 *     - set currentTabId
 * also storing all links on each loaded site in visitStore
 *
 * TODO:
 *   - handling of two tabs at same site at same time?
 *   - need to store hostname of openerTabId, not the number
 *   - track referrer
 *   - print dates in right timezone
 *   - consent form needs a lot more content
 *   - remove debugging setup code at bottom of file
 */
const filterStatus = { properties:["status"] }
function initCollectionListeners() {
    if (debug > 1) console.log("setting up data collection");
    browser.tabs.onUpdated.addListener(handleTabUpdated, properties=filterStatus);
    browser.tabs.onUpdated.addListener(handleTabUpdatedAll);
    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.windows.onFocusChanged.addListener(handleWindowChanged);
    browser.runtime.onMessage.addListener(handleMessage);
    browser.contentScripts.register({
        "matches": [
            "*://*.developer.mozilla.org/*",
            "*://*.nytimes.com/*",
            "*://*.washingtonpost.com/*",
            "*://*.vox.com/*",
            "*://*.arstechnica.com/*",
            "*://*.justice.gov/*",
            "*://*.wsj.com/*",
            "*://*.ft.com/*"
        ],
        "js": [
            {"file":"/scripts/lib/localforage.min.js"},
            {"file":"/scripts/inspect.js"}
        ]
    }).then(unregObj => {unregCS = unregObj;},
            () => {console.log("error in registering cs");});
}

var unregCS = null;
function collectionMain(colCon) {
    if (colCon) initCollectionListeners();
    else {
        if (debug > 1) console.log("removing data collection");
        browser.tabs.onUpdated.removeListener(handleTabUpdated);
        browser.tabs.onUpdated.removeListener(handleTabUpdatedAll);
        browser.tabs.onActivated.removeListener(handleTabActivated);
        browser.windows.onFocusChanged.removeListener(handleWindowChanged);
        browser.runtime.onMessage.removeListener(handleMessage);
        if (unregCS != null) unregCS.unregister();
    }
}

localforage.config({
    driver: [localforage.INDEXEDDB,
             localforage.WEBSQL,
             localforage.LOCALSTORAGE],
    name: "datacollectionDB"
});

var visitStore = localforage.createInstance({name: "visitStore"});
var configStore = localforage.createInstance({name: "configStore"});
var contentsStore = localforage.createInstance({name: "contentsStore"});

localforage.setItem("collectionConsent", true)
    .then(() => {
        collectionMain(true);
    });

function handleMessage(request, sender, sendResponse) {
    if (debug > 4) console.log("handleMessage");
    if (request.type === "indirectNewsLinks") {
        handleIndirectNewsLinksMessage(request, sender, sendResponse);
    }
    else if (request.type === "newsSitesAllLinks") {
        var hostname = extractHostnameUrl(sender.url);
        contentsStore.getItem(hostname)
            .then(obj => { logAllLinksMessage(obj, sender, request, hostname); });
    }
}

