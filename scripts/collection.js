(function() {

    var currentTab = -1;
    var startTime = 0;
    var debug = true;

    /* takes a string representing a url and returns the hostname
     * ex: https://www.vox.com/policy-and-politics/2019/9/12/20860452/julian-castro-2020-immigration-animals-policy-trump-climate-homeless
     *    becomes www.vox.com
     */
    function extractHostnameUrl(url) {
        if (debug) console.log("extractHostnameUrl");
        urlObj = new URL(url);
        if (urlObj.hostname) return urlObj.hostname;
        else { throw "hostnameErr"; }
    }

    function errorGetSites(err) {
        if (debug) console.log("errorGetSites");
        console.log("error getting site: ", err);
    }

    function findActiveTab(windowInfo) {
        if (debug) console.log("findActiveTab");
        for (tabInfo of windowInfo.tabs) {
            if (tabInfo.active) return tabInfo;
        }
    }

    function initSite(sites, hostname) {
        if (debug) console.log("initSite");
        sites[hostname] = {"visits":1, "time":0.0};
        browser.storage.local.set({sites});
        console.log("added sites %s to sites", hostname);
    }

    function printStats(sites) {
        if (debug) console.log("printStats");
        console.log("******* printing full stats *********");
        for (var site in sites) {
            console.log("%s was visited %d times for total elapsed time %d milliseconds",
                        site, sites[site]["visits"], sites[site]["time"]);
        }
    }

    function logSiteVisitCallback(obj, tab) {
        if (debug) console.log("logSiteVisitCallback");
        let sites = obj["sites"];

        try { var hostname = extractHostnameUrl(tab.url); }
        catch(err) {
            console.log("couldn't extract hostname from ", tab.url);
            return;
        }

        if (!(hostname in sites)) initSite(sites, hostname);
        (sites[hostname])["visits"]++;

        browser.storage.local.set({sites});
    }

    function logSiteVisit(tab) {
        if (debug) console.log("logSiteVisit");
        browser.storage.local.get("sites")
            .then(obj => logSiteVisitCallback(obj, tab), errorGetSites);
    }

    function logSiteTimeCallback(obj, timeElapsed, tabId) {
        if (debug) console.log("logSiteTimeCallback");
        let sites = obj["sites"];
        browser.tabs.get(tabId)
        .then(function (tab) {
            try { var hostname = extractHostnameUrl(tab.url); }
            catch(err) {
                console.log("couldn't extract hostname from ", tab.url);
                return;
            }

            if (!(hostname in sites)) initSite(sites, hostname);
            (sites[hostname])["time"] += timeElapsed;
            console.log("adding %d milliseconds to %s", timeElapsed, hostname);
            browser.storage.local.set({sites});
            printStats(sites);
        });
    }

    function recordTime(timeEnded, timeStarted, tabId) {
        if (debug) console.log("recordTime");
        browser.storage.local.get("sites")
        .then(obj => logSiteTimeCallback(obj, timeEnded - timeStarted, tabId),
              errorGetSites);
    }

    function unsetCurrrentTab() {
        if (debug) console.log("unsetCurrrentTab");
        if (currentTab != -1) {
            recordTime(Date.now(), startTime, currentTab);
            //console.log("no active tab");
            currentTab = -1;
        }
    }

    function setCurrentTab(tab) {
        if (debug) console.log("setCurrentTab");
        if (currentTab != -1) {
            recordTime(Date.now(), startTime, currentTab);
        }
        currentTab = tab.id;
        startTime = Date.now();
        /*
        try {
            var hostname = extractHostnameUrl(tab.url);
            console.log("tab %d (hostname %s) is active tab", tab.id, hostname);
        } catch {
            console.log("tab %d (url %s) is active tab", tab.id, tab.url);
        }
        */
    }

    function handleTabUpdated(tabId, changeInfo, tab) {
        if (debug) console.log("handleTabUpdated");
        if ("url" in changeInfo) {
            logSiteVisit(tab);
            setCurrentTab(tab);
        }
    }

    function handleTabActivated(info) {
        if (debug) console.log("handleTabActivated");
        var newTabId = info.tabId;
        browser.tabs.get(newTabId)
            .then(function(tab){
                setCurrentTab(tab);
            })
    }

    function handleWindowChanged(windowId) {
        if (debug) console.log("handleWindowChanged");
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
     *     - set currentTab variable
     *   - open a new tab
     *     - don't really need to do anything
     *   - change the url of an existing tab
     *     - catch with careful reading of onUpdated
     *     - set currentTab for new URL
     *   - open a new window or switch windows
     *     - easy to catch with windows.onFocusChanged
     *     - set currentTab
     * TODO:
     *   - if user opens new tab with no content, then switches
     *       away to tab i, then switches back to the empty tab,
     *       tab i will still be stored as the active tab
     *   - seems to loop sometimes
     *   - doesn't handle tab closed events well -- tries to look up
     */

    browser.tabs.onUpdated.addListener(handleTabUpdated);
    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.windows.onFocusChanged.addListener(handleWindowChanged);

})();
