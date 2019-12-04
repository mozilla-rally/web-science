import { debugLog } from './DebugLog.js';

var isResolving = false;
var nredirects = 4;
var store = new Map();
var requestids = new Map();

function onRequest(details) {
  // if we are resolving urls
  if (!isResolving) {
    return
  } else if (store.has(details.url) && !requestids.has(details.requestId)) {
    // TODO : if number of resolves are greater than 1 then cancel the request
    // new chain for the url
    var chain = new Array();
    chain.push(details.url);
    requestids.set(details.requestId, chain);
  }
}

function onRedirect(details) {
    // are we resolving and tracking this specific request id
    if(isResolving && requestids.has(details.requestId)) {
      var chain = requestids.get(details.requestId);
      chain.push(details.redirectUrl);
    }
}

function onResponse(details) {
    // are we getting a response for one of the requests that we're tracking
    if(isResolving && requestids.has(details.requestId)) {
      var chain = requestids.get(details.requestId);
      var url = chain[0];
      // get the resolves for this url
      var resolves = store.get(url) || [];
      for(var i=0; i< resolves.length; i++) {
        var r = resolves[i];
        r(chain);
      }
      store.delete(url);
    }
}

// add listeners for the three events
browser.webRequest.onBeforeRequest.addListener(onRequest, { urls: ["<all_urls>"] });
browser.webRequest.onBeforeRedirect.addListener(onRedirect, { urls: ["<all_urls>"] });
browser.webRequest.onResponseStarted.addListener(onResponse, { urls: ["<all_urls>"] });

export function resolveURL(url) {
    if(!isResolving) {
        isResolving = true;
    }
    // returns a promise that resolves to the final url
    var p = new Promise(function(resolve, reject) {
        // store this resolve object in the store
        var resolves = store[url] || [];
        resolves.push(resolve);
        store.set(url, resolves);
        // fetch this url
        fetch(url, {redirect: 'follow'});
    });
    return p;
}