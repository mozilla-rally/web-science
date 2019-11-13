var currentTabId = -1;
var startTime = 0;
var debug = 2;
var cumulTimes = new Array();
var cumulHostnames = new Array();

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

function printNewContentsStats() {

    console.log("\n******* printing new contents stats *********");

    newContentsStore.iterate(function(value, key, iterationNumber) {
        console.log("site %s has these pages stored:", key);
        for (page in value["path"]) {
            console.log("url %s was loaded %s, looked at for %.2f seconds, left at %s, has referrer %s",
                value["path"][page]["url"],
                value["path"][page]["startTime"],
                value["path"][page]["cumulative"]/1000.0,
                value["path"][page]["endTime"],
                value["path"][page]["referer"]);
        }
    });
}

function recordTime(timeEnded, timeStarted, tabId) {

    if (cumulTimes[tabId]) cumulTimes[tabId] += timeEnded - timeStarted;
    else cumulTimes[tabId] = timeEnded - timeStarted;
    console.log("added %d seconds to tabId %d, now %d", (timeEnded - timeStarted)/1000.0, tabId, cumulTimes[tabId]/1000.0);
}

function unsetCurrrentTab() {
    if (debug > 4) console.log("unsetCurrrentTab");
    if (currentTabId != -1) {
        recordTime(Date.now(), startTime, currentTabId);
        currentTabId = -1;
    }
}

function setCurrentTab(tabId) {
    if (debug > 4) console.log("setCurrentTab");
    if (currentTabId != -1) {
        recordTime(Date.now(), startTime, currentTabId);
    }
    startTime = Date.now();
    currentTabId = tabId;
}

function handleTabActivated(info) {
    if (debug > 4) console.log("handleTabActivated");
    var newTabId = info.tabId;
    browser.tabs.get(newTabId)
        .then(function(tab){
            setCurrentTab(tab.id);
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
            setCurrentTab(tab.id);
        }, unsetCurrrentTab)
}

function getAndResetCumulTime(tabId) {
    setCurrentTab(tabId);
    var cumul = cumulTimes[tabId];
    cumulTimes[tabId] = 0.0;
    console.log("returning %d seconds for tabId %d", cumul / 1000.0, tabId);
    return cumul;
}

function clearTabIdCumul(hostname, tabId) {
    setCurrentTab(tabId);
    if (hostname === cumulHostnames[tabId]) return;
    cumulTimes[tabId] = 0.0;
    cumulHostnames[tabId] = hostname;
    console.log("cleared cumulTime for hn %s, tabId %d", hostname, tabId);
}
