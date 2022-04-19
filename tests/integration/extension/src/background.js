import * as webScience from "@mozilla/web-science"

async function pageVisitStartListener(pageVisit) {
    console.debug("WebScienceTest - Page visit start:", pageVisit);
}

async function pageVisitStopListener(pageVisit) {

    console.debug("WebScienceTest - Page visit stop:", pageVisit);
}

async function pageDataListener(pageData) {
    console.debug("WebScienceTest - Page navigation data:", pageData);
}

webScience.pageManager.onPageVisitStart.addListener(pageVisitStartListener);
webScience.pageManager.onPageVisitStop.addListener(pageVisitStopListener);

webScience.pageNavigation.onPageData.addListener(pageDataListener, { matchPatterns: ["<all_urls>"] });