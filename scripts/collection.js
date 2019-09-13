(function() {
    /**
     * Check and set a global guard variable.
     * If this content script is injected into the same page again,
     * it will do nothing next time.
     */
    if (window.hasRun) {
        return;
    }
    window.hasRun = true;

    /* takes a string representing a url and returns the hostname
     * ex:
     *    https://www.vox.com/policy-and-politics/2019/9/12/20860452/julian-castro-2020-immigration-animals-policy-trump-climate-homeless
     *    becomes
     *    www.vox.com
     */
    function extractHostnameUrl(url) {
        urlObj = new URL(url);
        if (urlObj.hostname) {return urlObj.hostname}
        else {console.log("error extracting hostname from ", url); return ""}
    }

    function checkNewTab(tab) {
        console.log("new tab url: %s", tab.url);
    }

    function logNewSite(obj, url) {
        let sites = obj["sites"];
        console.log("initial sites: ", sites);
        let hostname = extractHostnameUrl(url);
        if (hostname in sites) {sites[hostname]++; }
        else { sites[hostname] = 1; }
        browser.storage.local.set({sites});
        console.log("post sites: ", sites);
    }

    function errorGetSites(err) {
        console.log("error getting site: ", err);
    }

    function checkTabUpdated(tabId, changeInfo, tab) {
        if (changeInfo.url) {
            console.log("updated tab's url: %s", changeInfo.url);
            browser.storage.local.get("sites")
            .then(sites => logNewSite(sites, changeInfo.url), errorGetSites);
        }
        else {
            console.log("no new url");
        }
    }

    const filter = {
        properties: ["status"]
    }

    var sites = {
    }
    browser.storage.local.set({sites})
    browser.tabs.onCreated.addListener(checkNewTab);
    browser.tabs.onUpdated.addListener(checkTabUpdated, filter);

})();
