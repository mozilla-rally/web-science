(function() {

    var currentTabId = -1;
    var currentTabHostname = "";
    var startTime = 0;
    var debug = false;

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
        console.log("error getting sites: ", err);
    }

    function findActiveTab(windowInfo) {
        if (debug) console.log("findActiveTab");
        for (tabInfo of windowInfo.tabs) {
            if (tabInfo.active) return tabInfo;
        }
    }

    function initSite(sites, hostname) {
        if (debug) console.log("initSite");
        sites[hostname] = {"visits":0, "time":0.0};
        console.log("added sites %s to sites", hostname);
    }

    function printStats(sites) {
        if (debug) console.log("printStats");
        console.log("******* printing full stats *********");
        for (var site in sites) {
            console.log("%s was visited %d times for total elapsed time %.2f seconds",
                        site, sites[site]["visits"], sites[site]["time"]/1000);
        }
    }

    function logSiteVisitCallback(obj, tab) {
        if (debug) console.log("logSiteVisitCallback");
        let sites = obj["sites"];

        try { var hostname = extractHostnameUrl(tab.url); }
        catch(err) {
            if (debug) console.log("couldn't extract hostname from ", tab.url);
            return;
        }

        if (!(hostname in sites)) initSite(sites, hostname);
        (sites[hostname])["visits"]++;

        browser.storage.local.set({sites})
            .then(() => {},
                  () => {console.log("error storing sites in visit callback");} );
    }

    function logSiteVisit(tab) {
        if (debug) console.log("logSiteVisit");
        browser.storage.local.get("sites")
            .then(obj => logSiteVisitCallback(obj, tab), errorGetSites);
    }

    function logSiteTimeCallback(obj, timeElapsed, tabId, tabHostname) {
        if (debug) console.log("logSiteTimeCallback");
        let sites = obj["sites"];
        if (!(tabHostname in sites)) initSite(sites, tabHostname);
        (sites[tabHostname])["time"] += timeElapsed;
        console.log("adding %d milliseconds to %s", timeElapsed, tabHostname);
        browser.storage.local.set({sites})
            .then(() => {},
                  () => {console.log("error storing sites in visit callback");} );
        printStats(sites);
    }

    function recordTime(timeEnded, timeStarted, tabId, tabHostname) {
        if (debug) console.log("recordTime");
        if (tabHostname === "") {
            if (debug) console.log("ignoring unknown site");
            return;
        }
        browser.storage.local.get("sites")
        .then(obj => logSiteTimeCallback(obj, timeEnded - timeStarted, tabId, tabHostname),
              errorGetSites);
    }

    function unsetCurrrentTab() {
        if (debug) console.log("unsetCurrrentTab");
        if (currentTabId != -1) {
            recordTime(Date.now(), startTime, currentTabId, currentTabHostname);
            //console.log("no active tab");
            currentTabId = -1;
            currentTabHostname = "";
        }
    }

    function setCurrentTab(tab) {
        if (debug) console.log("setCurrentTab");
        if (currentTabId != -1) {
            recordTime(Date.now(), startTime, currentTabId, currentTabHostname);
        }
        startTime = Date.now();
        currentTabId = tab.id;
        try {
            currentTabHostname = extractHostnameUrl(tab.url);
        } catch(err) {
            currentTabHostname = "";
            if (debug) console.log("couldn't extract hostname from %s", tab.url);
        }
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
     *   - doesn't handle tab closed events well -- tries to look up
     *     - now, stores hostname as well as tabId so it can log w/o lookup
     *   - seems to loop sometimes
     *     - fixed? never found proof or a cause but it stopped happening
     *
     * TODO:
     *   - if user opens new tab with no content, then switches
     *       away to tab i, then switches back to the empty tab,
     *       tab i will still be stored as the active tab
     */

    browser.tabs.onUpdated.addListener(handleTabUpdated);
    browser.tabs.onActivated.addListener(handleTabActivated);
    browser.windows.onFocusChanged.addListener(handleWindowChanged);

})();
