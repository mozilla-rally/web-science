/**
 * Module for resolving a short url
 * @module WebScience.Utilities.LinkResolution
 */
import { getDebuggingLog } from './Debugging.js';
import { shortDomains } from '/WebScience/dependencies/shortdomains.js';
const debugLog = getDebuggingLog("Studies.LinkResolution");


let initialized = false;
// promiseStore is a mapping from a url to resolve and the resolve objects associated with it
let promiseStore = new Map();
// trackLinks is a set for which the headers are observed
let trackLinks = new Set();
// links is a mapping from a redirected url to url fetched
// recursively traversing this mapping will get the redirect chain associated with an initial url
let links = new Map();

/**
 * Function to resolve a given url to the final url that it points to
 * @param {string} url - URL to resolve
 * @returns {Promise.Object} - An object containing the destination url
 */
export function resolveUrl(url) {
  if(!initialized) {
    return Promise.reject("module not initialized");
  }
  var p = new Promise(function (resolve, reject) {
    // store this resolve object in promiseStore
    let resolves = promiseStore[url] || [];
    resolves.push({
      resolve: resolve,
      reject: reject
    });
    promiseStore.set(url, resolves);
    trackLinks.add(url);
    // fetch this url
    fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': url.includes("news.google.com") ? 'curl/7.10.6 (i386-redhat-linux-gnu) libcurl/7.10.6 OpenSSL/0.9.7a ipv6 zlib/1.1.4' : ''
      }
    });
  });
  return p;
}

/**
 * Function to extract location value from response header.
 * The response header from onHeadersReceived is an array of objects, one of which possibly
 * contains a field with name location (case insensitive).
 * This function finds such an object
 * 
 * @param {Array} headers array containing response headers
 * @returns {(Object|null)} HTTP response header object for the `Location` header (see `webRequest.HttpHeaders`) or `null`
 */
function getLocationFromResponseHeader(headers) {
  return headers.find(obj => {return obj.name.toUpperCase() === "LOCATION"; });
}

/**
 * Listener for https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onHeadersReceived
 * @param {Object} details contains details of the request
 */
function responseHeaderListener(details) {
  // Continue only if this url is relevant for link resolution
  if(!trackLinks.has(details.url)) {
    return;
  }
  // get response header
  let loc = getLocationFromResponseHeader(details.responseHeaders);
  // if the response header contains a new url
  if (loc != null && (loc.value != details.url)) {
    let nexturl = loc.value;
    // Create a link between the next url and the initial url
    links.set(nexturl, details.url);
    // Add the next url so that we process it during the next onHeadersReceived
    trackLinks.add(nexturl);
    // Send fetch request to the next url
    fetch(nexturl, { redirect: 'manual', headers: { 'User-Agent': '' } });
  } else { // url is not redirected
    if (links.has(details.url)) {
      // backtrack links to get to the promise object that corresponds to this
      let url = details.url;
      while (links.has(url)) {
        let temp = url;
        url = links.get(url);
        links.delete(temp);
        trackLinks.delete(temp);
      }
      // url now contains the initial url. Now, resolve the corresponding promises
      if (url && promiseStore.has(url)) {
        let resolves = promiseStore.get(url) || [];
        let resolveObj = { source: url, dest: details.url };
        for (var i = 0; i < resolves.length; i++) {
          var r = resolves[i].resolve;
          r(resolveObj);
        }
        promiseStore.delete(url);
      }
    }
  }
}

/**
 * Listener for https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onErrorOccurred
 * @param {Object} responseDetails - Contains details of the error
 */
function trackError(responseDetails) {
  let url = responseDetails.url;
  if(promiseStore.has(url)) {
    let resolves = promiseStore.get(url) || [];
    for (let i = 0; i < resolves.length; i++) {
      let r = resolves[i].reject;
      r(responseDetails.error);
    }
    promiseStore.delete(url);
  }
}

/**
 * Initializes the link resolution module by setting up listeners for onHeadersReceived event
 * @returns {void} Nothing
 */
export function initialize() {
  initialized = true;
  let headerListener = browser.webRequest.onHeadersReceived.addListener(responseHeaderListener, {urls : ["<all_urls>"]}, ["responseHeaders"]);
  let errorListener = browser.webRequest.onErrorOccurred.addListener(trackError, {urls : ["<all_urls>"]});
}

/**
 * Returns a list of short domains that the link resolution module can resolve
 * @returns {String[]} Array of domains
 */
export function getShortDomains() {
  return shortDomains;
}