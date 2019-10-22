var currentTabId = -1;
var currentTabHostname = "";
var startTime = 0;
var debug = 2;

/* takes a string representing a url and returns the hostname
 * ex: https://www.vox.com/policy-and-politics/2019/9/12/20860452/julian-castro-2020-immigration-animals-policy-trump-climate-homeless
 *    becomes www.vox.com
 */
function extractHostnameUrl(url) {
    if (debug > 4) console.log("extractHostnameUrl");
    urlObj = new URL(url);
    if (urlObj.hostname) return urlObj.hostname;
    else { throw "hostnameErr"; }
}

function errorGetSites(err) {
    if (debug > 4) console.log("errorGetSites");
    if (debug > 0) console.log("error getting sites: ", err);
}

function findActiveTab(windowInfo) {
    if (debug > 4) console.log("findActiveTab");
    for (tabInfo of windowInfo.tabs) {
        if (tabInfo.active) return tabInfo;
    }
}

function initSite(hostname) {
    if (debug > 4) console.log("initSite");
    var obj  = {"numVisits":0, "totalTime":0.0, "visits":[{"visitTime": 0.0}]};
    if (debug > 1) console.log("added sites %s to sites", hostname);
    return obj;
}

function printStats(sites) {
    if (debug > 4) console.log("printStats");
    console.log("\n******* printing full stats *********");

    localforage.iterate(function(value, key, iterationNumber) {
        if (key === "collectionConsent") return;
        console.log("%s was visited %d times for total elapsed time %.2f seconds",
            key, value["numVisits"], value["totalTime"]/1000);
        for (var i = 0; i < value["numVisits"]; i++) {
            var start = value["visits"][i]["visitStartTime"];
            console.log("%s visit %d: loaded %s, duration %d, openerId %d", key, i, start.toISOString(), value["visits"][i]["visitTime"], value["visits"][i]["openerTabId"]);
        }
    });
}

function logSiteVisitCallback(obj, tab, hostname) {
    if (debug > 4) console.log("logSiteVisitCallback");

    if (obj == null) obj = initSite(hostname);
    obj["numVisits"]++;
    var currentVisitIndex = obj["numVisits"] - 1;
    var allVisits = obj["visits"];
    var openerTabId;
    if (tab.openerTabId) openerTabId = tab.openerTabId;
    else openerTabId = -1;
    var currentVisit = {"visitTime": 0.0, "visitStartTime":new Date(), "openerTabId":openerTabId};
    allVisits[currentVisitIndex] = currentVisit;

    localforage.setItem(hostname, obj)
        .then(() => {},
            () => {if (debug > 0) console.log("error storing sites in visit callback");} );
}

function logSiteVisit(tab) {
    if (debug > 4) console.log("logSiteVisit");

    try { var hostname = extractHostnameUrl(tab.url); }
    catch(err) {
        if (debug > 2) console.log("couldn't extract hostname from ", tab.url);
        return;
    }
    if (tab.openerTabId) {
        console.log("logsitevisit for hn %s, openerTabId %d", hostname, tab.openerTabId);
    }
    else {
        console.log("no openerTabId for hn %s", hostname);
    }

    localforage.getItem(hostname)
        .then(obj => logSiteVisitCallback(obj, tab, hostname), errorGetSites);
}

function logSiteTimeCallback(obj, timeElapsed, tabId, tabHostname) {
    if (debug > 4) console.log("logSiteTimeCallback");

    if (obj == null) {
        if (debug > 0) console.log("#### close existing tabs before restarting extension");
        obj = initSite(tabHostname);
    }
    obj["totalTime"] += timeElapsed;
    if (debug > 2) console.log("adding %d milliseconds to %s", timeElapsed, tabHostname);

    var numVisits = obj["numVisits"];
    var currentVisitIndex = numVisits - 1;
    var currentVisit = obj["visits"][currentVisitIndex];
    var currentVisitTime = currentVisit["visitTime"];

    currentVisit["visitTime"] = currentVisitTime + timeElapsed;

    localforage.setItem(tabHostname, obj)
        .then(() => {printStats()},
            () => {if (debug > 0) console.log("error storing sites in visit callback");} );
}

function recordTime(timeEnded, timeStarted, tabId, tabHostname) {
    if (debug > 4) console.log("recordTime");
    if (tabHostname === "") {
        if (debug > 3) console.log("ignoring unknown site");
        return;
    }
    localforage.getItem(tabHostname)
        .then(obj => logSiteTimeCallback(obj, timeEnded - timeStarted, tabId, tabHostname),
            errorGetSites);
}

function unsetCurrrentTab() {
    if (debug > 4) console.log("unsetCurrrentTab");
    if (currentTabId != -1) {
        recordTime(Date.now(), startTime, currentTabId, currentTabHostname);
        currentTabId = -1;
        currentTabHostname = "";
    }
}

function setCurrentTab(tab) {
    if (debug > 4) console.log("setCurrentTab");
    if (currentTabId != -1) {
        recordTime(Date.now(), startTime, currentTabId, currentTabHostname);
    }
    startTime = Date.now();
    currentTabId = tab.id;
    try {
        currentTabHostname = extractHostnameUrl(tab.url);
    } catch(err) {
        currentTabHostname = "";
        if (debug > 3) console.log("couldn't extract hostname from %s", tab.url);
    }
}

function handleTabUpdated(tabId, changeInfo, tab) {
    if (debug > 4) console.log("handleTabUpdated");
    if ("url" in changeInfo || "status" in changeInfo && changeInfo["status"] === "complete") {
        if (debug > 2) console.log("changeInfo", changeInfo);
    }

    if ("status" in changeInfo && changeInfo["status"] === "complete" && !("url" in changeInfo)) {
        logSiteVisit(tab);
        if (tab.active) {
            setCurrentTab(tab);
        }
    }
}

function handleTabActivated(info) {
    if (debug > 4) console.log("handleTabActivated");
    var newTabId = info.tabId;
    browser.tabs.get(newTabId)
        .then(function(tab){
            setCurrentTab(tab);
        })
}

function handleWindowChanged(windowId) {
    if (debug > 4) console.log("handleWindowChanged");
    if (windowId == -1) {
        unsetCurrrentTab();
        return;
    }
    browser.windows.get(windowId, {populate: true})
        .then(function(windowInfo) {
            tab = findActiveTab(windowInfo);
            setCurrentTab(tab);
        }, unsetCurrrentTab)
}

/* user could:
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
 * FIXED:
 *   - doesn't handle tab closed events well -- tries to look up by ID, which fails
 *     - now, stores hostname as well as tabId so it can log w/o lookup
 *   - seems to loop sometimes
 *     - fixed? never found proof or a cause but it stopped happening
 *   - if user opens new tab with no content, then switches
 *       away to tab i, then switches back to the empty tab,
 *       tab i will still be stored as the active tab
 *     - fixed by more closely following window events
 *   - consent form before collecting data
 *   - log each visit separately
 *     - change format of stored record to include array of visits
 *   - opening tab in background incorrectly sets it as the active site
 *     - fixed by checking whether tab is active once it loads
 *
 * TODO:
 *   - handling of two tabs at same site at same time?
 *   - need to store hostname of openerTabId, not the number
 *   - track referrer
 *   - print dates in right timezone
 *   - consent form needs a lot more content
 *   - remove debugging setup code at bottom of file
 */
function initCollectionListeners() {
    if (debug > 1) console.log("setting up data collection");
    browser.tabs.onUpdated.addListener(handleTabUpdated);
    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.windows.onFocusChanged.addListener(handleWindowChanged);
}

function collectionMain(colCon) {
    if (colCon) initCollectionListeners();
    else {
        if (debug > 1) console.log("removing data collection");
        browser.tabs.onUpdated.removeListener(handleTabUpdated);
        browser.tabs.onActivated.removeListener(handleTabActivated);
        browser.windows.onFocusChanged.removeListener(handleWindowChanged);
    }
}

localforage.config({
    driver: [localforage.INDEXEDDB,
             localforage.WEBSQL,
             localforage.LOCALSTORAGE],
    name: "datacollectionDB"
});

/* TODO only for debugging, remove later */
localforage.setItem("collectionConsent", true)
    .then(() => {
        collectionMain(true);
    });
