window.browser = require("webextension-polyfill");
const AttentionStream = require('./AttentionStream');
const attention = new AttentionStream();
attention.onChange((event) => {
    console.info('----------')
    console.info("reason: ", event.reason);
    console.info("url:    ", event.url);
    console.info("elapsed:", event.elapsed);
});

// browser.tabs.create({ url: "https://news.ycombinator.com", active: true});
// browser.tabs.create({ url: "https://www.newyorker.com/magazine/1996/10/21/the-outsider-9", active: true});

function openPage() {
  browser.runtime.openOptionsPage().catch(e => {
    console.error(`Study Add-On - Unable to open the control panel`, e);
  });
}

browser.browserAction.onClicked.addListener(openPage);