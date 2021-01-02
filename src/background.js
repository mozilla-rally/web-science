window.browser = require("webextension-polyfill");
const AttentionStream = require('./AttentionStream');
const attention = new AttentionStream();
attention.onChange((event) => {
    console.log('----------')
    console.log("reason: ", event.reason);
    console.log("url:    ", event.url);
    console.log("elapsed:", event.elapsed);
});

browser.tabs.create({ url: "https://news.ycombinator.com", active: true});
browser.tabs.create({ url: "https://washingtonpost.com", active: true});

function openPage() {
  browser.runtime.openOptionsPage().catch(e => {
    console.error(`Study Add-On - Unable to open the control panel`, e);
  });
}

browser.browserAction.onClicked.addListener(openPage);