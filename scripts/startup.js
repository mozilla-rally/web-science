var unregCS = null;

function initCollectionListeners() {
    if (debug > 1) console.log("setting up data collection");
    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.windows.onFocusChanged.addListener(handleWindowChanged);
    browser.runtime.onMessage.addListener(handleMessage);
    browser.runtime.onConnect.addListener(newsSitesListener);
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
            {"file":"/scripts/inspect.js"},
            {"file":"/scripts/newsSites.js"}
        ]
    }).then(unregObj => {unregCS = unregObj;},
            () => {console.log("error in registering cs");});
}

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
});

var visitStore = localforage.createInstance({name: "visitStore"});
var configStore = localforage.createInstance({name: "configStore"});
var contentsStore = localforage.createInstance({name: "contentsStore"});
var newContentsStore = localforage.createInstance({name: "newContentsStore"});

function handleMessage(request, sender, sendResponse) {
    if (debug > 4) console.log("handleMessage");
    if (request.type === "indirectNewsLinks") {
        handleIndirectNewsLinksMessage(request, sender, sendResponse);
    }
}

/* TODO only for debugging, remove later */
localforage.setItem("collectionConsent", true)
    .then(() => {
        collectionMain(true);
    });
