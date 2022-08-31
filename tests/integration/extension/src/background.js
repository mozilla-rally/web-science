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

// Firefox only supports this as of version 105, remove this check when that version of Firefox ships.
let persistAcrossSessions = true;
browser.runtime && browser.runtime.getBrowserInfo && browser.runtime.getBrowserInfo().then(async browserInfo => {
    if (browserInfo && browserInfo.name === "Firefox") {
        persistAcrossSessions = false;
    }

    const contentScriptId = "webextension-test";
    let scripts = await browser.scripting.getRegisteredContentScripts({
        ids: [contentScriptId],
    });

    if (scripts.length > 0) {
        await browser.scripting.unregisterContentScripts({
            ids: [contentScriptId]
        });
    }

    // Load content script(s) required by this extension.
    browser.scripting.registerContentScripts([{
        id: contentScriptId,
        js: ["dist/browser-polyfill.min.js", "dist/test.content.js"],
        matches: ["<all_urls>"],
        persistAcrossSessions,
        runAt: "document_start"
    }])
        .then(result => console.debug(result))
        .catch(err => console.err(err));
});
