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

function initSite(sites, hostname) {
    if (debug > 4) console.log("initSite");
    sites[hostname] = {"numVisits":0, "totalTime":0.0, "visits":[{"visitTime": 0.0}]};
    if (debug > 1) console.log("added sites %s to sites", hostname);
}

function printStats(sites) {
    if (debug > 4) console.log("printStats");
    console.log("\n******* printing full stats *********");
    for (var site in sites) {
        console.log("%s was visited %d times for total elapsed time %.2f seconds",
            site, sites[site]["numVisits"], sites[site]["totalTime"]/1000);
        for (var i = 0; i < sites[site]["numVisits"]; i++) {
            var start = sites[site]["visits"][i]["visitStartTime"];
            console.log("%s visit %d: loaded %s, duration %d", site, i, start.toISOString(), sites[site]["visits"][i]["visitTime"]);
        }
    }
}

function logSiteVisitCallback(obj, tab) {
    if (debug > 4) console.log("logSiteVisitCallback");
    let sites = obj["sites"];

    try { var hostname = extractHostnameUrl(tab.url); }
    catch(err) {
        if (debug > 2) console.log("couldn't extract hostname from ", tab.url);
        return;
    }

    if (!(hostname in sites)) initSite(sites, hostname);
    (sites[hostname])["numVisits"]++;
    var currentVisitIndex = (sites[hostname])["numVisits"] - 1;
    var allVisits = sites[hostname]["visits"];
    var currentVisit = {"visitTime": 0.0, "visitStartTime":new Date()};
    allVisits[currentVisitIndex] = currentVisit;

    browser.storage.local.set({sites})
        .then(() => {},
            () => {if (debug > 0) console.log("error storing sites in visit callback");} );
}

function logSiteVisit(tab) {
    if (debug > 4) console.log("logSiteVisit");
    browser.storage.local.get("sites")
        .then(obj => logSiteVisitCallback(obj, tab), errorGetSites);
}

function logSiteTimeCallback(obj, timeElapsed, tabId, tabHostname) {
    if (debug > 4) console.log("logSiteTimeCallback");
    let sites = obj["sites"];
    if (!(tabHostname in sites)) {
        if (debug > 0) console.log("#### close existing tabs before restarting extension");
        initSite(sites, tabHostname);
    }
    (sites[tabHostname])["totalTime"] += timeElapsed;
    if (debug > 2) console.log("adding %d milliseconds to %s", timeElapsed, tabHostname);

    var numVisits = (sites[tabHostname])["numVisits"];
    var currentVisitIndex = numVisits - 1;
    var currentVisit = sites[tabHostname]["visits"][currentVisitIndex];
    var currentVisitTime = currentVisit["visitTime"];

    currentVisit["visitTime"] = currentVisitTime + timeElapsed;

    browser.storage.local.set({sites})
        .then(() => {},
            () => {if (debug > 0) console.log("error storing sites in visit callback");} );
    printStats(sites);
}

function recordTime(timeEnded, timeStarted, tabId, tabHostname) {
    if (debug > 4) console.log("recordTime");
    if (tabHostname === "") {
        if (debug > 3) console.log("ignoring unknown site");
        return;
    }
    browser.storage.local.get("sites")
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

    //if ("url" in changeInfo) {
    if ("status" in changeInfo && changeInfo["status"] === "complete" && !("url" in changeInfo)) {
        logSiteVisit(tab);
        setCurrentTab(tab);
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
        }, unsetCurrrentTab())
}

var sites = {}
browser.storage.local.set({sites})

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
 *   - only listen for some onUpdated events
 *     - "filter" for just status updates
 *
 * TODO:
 *   - handling of two tabs at same site at same time?
 *   - track referrer
 *   - print dates in right timezone
 *   - consent form needs a lot more content
 *   - remove debugging setup code at bottom of file
 */
const filter = { properties:["status"] }
function initCollectionListeners() {
    if (debug > 1) console.log("setting up data collection");
    browser.tabs.onUpdated.addListener(handleTabUpdated, properties=filter);
    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.windows.onFocusChanged.addListener(handleWindowChanged);
}

function collectionMain() {
    browser.storage.local.get("collectionConsent")
        .then(obj => {
            if ("collectionConsent" in obj && obj["collectionConsent"])
                initCollectionListeners();
            else {
                if (debug > 1) console.log("removing data collection");
                browser.tabs.onUpdated.removeListener(handleTabUpdated);
                browser.tabs.onActivated.removeListener(handleTabActivated);
                browser.windows.onFocusChanged.removeListener(handleWindowChanged);
            }}, err => {console.log(err);});
}

/* TODO only for debugging, remove later */
browser.storage.local.set({"collectionConsent":true})
    .then(() => {
        sites = {};
        browser.storage.local.set(sites)
            .then(() => {
                collectionMain();
            })});
