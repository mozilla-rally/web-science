/**
 * Module for resolving a short url
 * @module WebScience.Utilities.LinkResolution
 */
import {
  getDebuggingLog
} from './Debugging.js';
import {
  shortDomains
} from '/WebScience/dependencies/shortdomains.js';
import {
  ampCacheDomains
} from '/WebScience/dependencies/ampcachedomains.js';
const debugLog = getDebuggingLog("Utilities.LinkResolution");


const fetchTimeoutMs = 5000;
let initialized = false;
// promisesByUrl is a mapping from a url to resolve and the resolve objects associated with it
let promisesByUrl = new Map();
// trackedUrls is a set for which the headers are observed
let trackedUrls = new Set();
// urlByRedirectedUrl is a mapping from a redirected url to url that redirected to it
// recursively traversing this mapping will get the redirect chain associated with an initial url
let urlByRedirectedUrl = new Map();

/**
 * Function to resolve a given url to the final url that it points to
 * @param {string} url - URL to resolve
 * @returns {Promise.Object} - An object containing the destination url
 */
export function resolveUrl(url) {
  if (!initialized) {
    return Promise.reject("module not initialized");
  }
  let urlResolutionPromise = new Promise(function (resolve, reject) {
    // store the resolve function in promisesByUrl. This function will be invoked when the 
    // url is resolved
    let resolves = promisesByUrl.get(url) || [];
    if (!resolves || !resolves.length) {
      promisesByUrl.set(url, resolves);
    }
    resolves.push({
      resolve: resolve,
      reject: reject
    });
    trackedUrls.add(url);
    // fetch this url
    fetchWithTimeout(url, {
      redirect: 'manual',
      headers: {
        /* With a browser User-Agent header, the response of news.google.com link shim is a HTML document that eventually redirects to the actual news page.
        This actual news link is not part of the HTTP response reader. However, using a non-browser User-Agent like curl the response header
        contains the redirected location. */
        'User-Agent': url.includes("news.google.com") ? 'curl/7.10.6 (i386-redhat-linux-gnu) libcurl/7.10.6 OpenSSL/0.9.7a ipv6 zlib/1.1.4' : ''
      }
    }, fetchTimeoutMs);
  });
  return urlResolutionPromise;
}

/**
 * Listener for https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onHeadersReceived
 * @param {Object} details contains details of the request
 */
function responseHeaderListener(details) {
  // Continue only if this url is relevant for link resolution
  if (!trackedUrls.has(details.url)) {
    return;
  }

  // The location field in response header indicates the redirected URL
  // The response header from onHeadersReceived is an array of objects, one of which possibly
  // contains a field with name location (case insensitive).
  let redirectedURLLocation = details.responseHeaders.find(obj => {
    return obj.name.toUpperCase() === "LOCATION";
  });

  // if the location field in response header contains a new url
  if (redirectedURLLocation != null && (redirectedURLLocation.value != details.url)) {
    let nexturl = redirectedURLLocation.value;
    // Create a link between the next url and the initial url
    urlByRedirectedUrl.set(nexturl, details.url);
    // Add the next url so that we process it during the next onHeadersReceived
    trackedUrls.add(nexturl);
    // Send fetch request to the next url
    fetchWithTimeout(nexturl, {
      redirect: 'manual',
      headers: {
        'User-Agent': ''
      }
    }, fetchTimeoutMs);
  } else { // url is not redirected
    if (urlByRedirectedUrl.has(details.url)) {
      // backtrack urlByRedirectedUrl to get to the promise object that corresponds to this
      let url = details.url;
      while (urlByRedirectedUrl.has(url)) {
        let temp = url;
        url = urlByRedirectedUrl.get(url);
        urlByRedirectedUrl.delete(temp);
        trackedUrls.delete(temp);
      }
      // url now contains the initial url. Now, resolve the corresponding promises
      if (url && promisesByUrl.has(url)) {
        let resolves = promisesByUrl.get(url) || [];
        let resolveObj = {
          source: url,
          dest: details.url
        };
        for (var i = 0; i < resolves.length; i++) {
          var r = resolves[i].resolve;
          r(resolveObj);
        }
        promisesByUrl.delete(url);
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
  if (promisesByUrl.has(url)) {
    let resolves = promisesByUrl.get(url) || [];
    for (let i = 0; i < resolves.length; i++) {
      let r = resolves[i].reject;
      r(responseDetails.error);
    }
    promisesByUrl.delete(url);
  }
}

/**
 * Initializes the link resolution module by setting up listeners for onHeadersReceived event
 * @returns {void} Nothing
 */
export function initialize() {
  initialized = true;
  let headerListener = browser.webRequest.onHeadersReceived.addListener(responseHeaderListener, {
    urls: ["<all_urls>"]
  }, ["responseHeaders"]);
  let errorListener = browser.webRequest.onErrorOccurred.addListener(trackError, {
    urls: ["<all_urls>"]
  });
}

/**
 * Returns a list of short domains that the link resolution module can resolve
 * @returns {String[]} Array of domains
 */
export function getShortDomains() {
  return shortDomains;
}

/**
 * Returns a list of amp cache domains
 * @returns {String[]} Array of domains
 */
export function getAmpCacheDomains() {
  return ampCacheDomains;
}

/**
 * Fetch API doesn't provide a native timeout option. This function uses AbortController to
 * timeout fetch requests.
 * @param {string} url - resource to fetch
 * @param {Object} init - fetch initialization
 * @param {number} timeout - timeout in ms for fetch requests
 */
function fetchWithTimeout(url, init, timeout) {
  const controller = new AbortController();
  init.signal = controller.signal;
  fetch(url, init);
  setTimeout(() => controller.abort(), timeout);
}
