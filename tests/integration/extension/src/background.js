import * as webScience from "@mozilla/web-science"
import browser from "webextension-polyfill";

async function sendMessageToSelenium(message) {
    // Send message to web content for Chromium
    const tabs = await browser.tabs.query({});
    console.debug(tabs);
    browser.tabs.sendMessage(tabs[0].id, message);
    // Log to console for Firefox
    console.debug(message);
}

async function pageVisitStartListener(pageVisit) {
    await sendMessageToSelenium(`WebScienceTest - Page visit start: ${JSON.stringify(pageVisit)}`);
}

async function pageVisitStopListener(pageVisit) {
    await sendMessageToSelenium(`WebScienceTest - Page visit stop: ${JSON.stringify(pageVisit)}`);
}

async function pageDataListener(pageData) {
    await sendMessageToSelenium(`WebScienceTest - Page navigation data: ${JSON.stringify(pageData)}`);
}

webScience.pageManager.onPageVisitStart.addListener(pageVisitStartListener);
webScience.pageManager.onPageVisitStop.addListener(pageVisitStopListener);

webScience.pageNavigation.onPageData.addListener(pageDataListener, { matchPatterns: ["<all_urls>"] });