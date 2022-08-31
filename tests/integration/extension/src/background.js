import * as webScience from "@mozilla/web-science"
import browser from "webextension-polyfill";

async function sendMessageToSelenium(message) {
    // Log to console for Firefox
    console.debug(message);

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

const domains = ["localhost"];

webScience.pageText.onTextParsed.addListener(async (pageData) => {
    await sendMessageToSelenium(`WebScienceTest - Page text received: ${JSON.stringify(pageData)}`);
}, {
    matchPatterns: webScience.matching.domainsToMatchPatterns(domains)
});

async function main() {
    // Firefox only supports this as of version 105, remove this check when that version of Firefox ships.
    let persistAcrossSessions = true;
    const browserInfo = browser.runtime && browser.runtime.getBrowserInfo && await browser.runtime.getBrowserInfo();
    if (browserInfo && browserInfo.name === "Firefox") {
        persistAcrossSessions = false;
    }

    const contentScriptId = "webextension-test";
    let scripts = await browser.scripting.getRegisteredContentScripts({
        ids: [contentScriptId],
    });

    if (scripts.length === 0) {

        // Load content script(s) required by this extension.
        await browser.scripting.registerContentScripts([{
            id: contentScriptId,
            js: ["dist/browser-polyfill.min.js", "dist/test.content.js"],
            matches: ["<all_urls>"],
            persistAcrossSessions,
            runAt: "document_start"
        }]);
    }
}

main()
    .then(res => console.debug(res))
    .catch(err => console.err(err));
