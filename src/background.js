// import browser from 'webextension-polyfill';
// window.browser = browser;
//const PE = require('./PageEvents');

// import {
//   registerPageVisitStartListener,
//   registerPageVisitStopListener,
//   registerPageAttentionStartListener,
//   registerPageAttentionStopListener  
// } from './PageEvents';

// registerPageVisitStartListener(({_tabID, _windowID, url, referrer, timeStamp}) => {
//   console.log('visit-start', new Date(timeStamp));
// })

// registerPageAttentionStartListener(({_tabID, _windowID, url, referrer, timeStamp}) => {
//   console.log('attention-start', new Date(timeStamp));
// })

// registerPageAttentionStopListener((event) => {
//   console.log('attention-stop', event, new Date(event.timeStamp));
// })

import AttentionStream from './AttentionStream';
const attention = new AttentionStream();

attention.onAttentionStart(event => {
  console.log("START", event);
})

attention.onAttentionEnd(event => {
  console.log("END", event);
})

// const AttentionStream = require('./AttentionStream');
// const attention = new AttentionStream();
// attention.onChange((event) => {
//     console.info('----------')
//     console.info("reason: ", event.reason);
//     console.info("url:    ", event.url);
//     console.info("elapsed:", event.elapsed);
// });

browser.tabs.create({ url: "https://news.ycombinator.com", active: true});
browser.tabs.create({ url: "https://www.newyorker.com/magazine/1996/10/21/the-outsider-9", active: true});

function openPage() {
  browser.runtime.openOptionsPage().catch(e => {
    console.error(`Study Add-On - Unable to open the control panel`, e);
  });
}

browser.browserAction.onClicked.addListener(openPage);