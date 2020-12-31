/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at https://mozilla.org/MPL/2.0/. */

window.browser = require("webextension-polyfill");

const activeSites = [];

// Initialization
let currentlyFocusedTab = {};
setStart();

function logTime() {
  setEnd();
  // console.info('Site', currentlyFocusedTab);
  appendToHistory();
  submitEvent();
  resetTimer();
}

function submitEvent() {
  // fill in details here.
}

function setDomain(domain) {
  currentlyFocusedTab.domain = domain;
}

function setStart() {
  currentlyFocusedTab.start = new Date();
}

function setEnd() {
  currentlyFocusedTab.end = new Date();
  currentlyFocusedTab.elapsed = currentlyFocusedTab.end - currentlyFocusedTab.start;
}

function appendToHistory() {
  activeSites.push({...currentlyFocusedTab});
}

function resetTimer() {
  currentlyFocusedTab = {};
}

async function getDomain() {
  const [tab] = await browser.tabs.query({currentWindow: true, active:true});
  return new URL(tab.url).hostname;
}

function isNewDomain(domain) {
  return domain !== currentlyFocusedTab.domain;
}

async function handleUpdate(_, changeInfo) {
  /* 
    Handles all cases where user clicks on a link of any kind.
  */
  const { status, url } = changeInfo;
  if ((status === 'loading' && url)) {
    const domain = await getDomain();
    // if the page load domain matches the currently active machine,
    // save and reset initial state.
    if (currentlyFocusedTab.start && isNewDomain(domain)) {
      logTime();
    }
    // if we have a loading update, set the domain and start time.
    setDomain(domain);
    setStart();
  }
}

async function handleActivation(tabID, changeInfo, tab) {
  const domain = await getDomain();
  if (isNewDomain(domain)) {
    logTime();
    setDomain(domain);
    setStart();
  }
}


// switch tabs, new tab
browser.tabs.onActivated.addListener(handleActivation)
browser.tabs.onUpdated.addListener(handleUpdate);
browser.tabs.onRemoved.addListener(handleActivation);

// const rally = new Rally();
// rally.initialize(
//   // A sample key id used for encrypting data.
//   "sample-invalid-key-id",
//   // A sample *valid* JWK object for the encryption.
//   {
//     "kty":"EC",
//     "crv":"P-256",
//     "x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
//     "y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
//     "kid":"Public key used in JWS spec Appendix A.3 example"
//   }
// );

function delay(time = 0) {
  return new Promise((resolve) => { setTimeout(resolve, time) } );
}

function report() {
  console.group('~.~.~. Time on Domains .~.~.~');
  activeSites.forEach(site => {
    const dom = site.domain === "" ? 'newtab' : site.domain;
    console.log(`${dom} – ${site.elapsed}ms`)
  });
  console.groupEnd();
}

async function browse(...items) {
  for (const [url, attention = 0, active = true] of items) {
    await browser.tabs.create({ url, active});
    await delay(attention);
  }
  report();
}

const aFewSites = [
  // URL                           attention (ms)  active
  ['https://news.ycombinator.com', 2000,           true],
  ['https://nytimes.com', 1000, false],
  ['https://google.com', 1000, false],
  ['https://washingtonpost.com', 5000, true],
  ['https://bing.com', 5000, true],
  ['https://bing.com', 2000, true],
  ['about:blank', 1000, true],
  ['https://yahoo.com', 1000, true],
]

const t = () => 2500 + Math.random() + 1000;
const alexa10US = [
  ["https://google.com", t(), true],
  ["https://youtube.com", t(), true],
  // ["https://amazon.com", t(), true],
  // ["https://yahoo.com", t(), true],
  // ["https://facebook.com", t(), true],
  // ["https://zoom.us", t(), true],
  // ["https://reddit.com", t(), true],
  // ["https://wikipedia.org", t(), true],
  // ["https://myshopify.com", t(), true],
  // ["https://ebay.com", t(), true],
  // ['about:blank', t(), true],
]

browse(...alexa10US)

function openPage() {
  browser.runtime.openOptionsPage().catch(e => {
    console.error(`Study Add-On - Unable to open the control panel`, e);
  });
}

browser.browserAction.onClicked.addListener(openPage);