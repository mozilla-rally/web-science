// twitter response
//<head><noscript><META http-equiv="refresh" content="0;URL=https://nyti.ms/2loU4p0"></noscript><title>https://nyti.ms/2loU4p0</title></head><script>window.opener = null; location.replace("https:\/\/nyti.ms\/2loU4p0")</script>


import { debugLog } from './DebugLog.js';

var isResolving = false;
var nredirects = 4;
var shortenerLength = 50;
var store = new Map();
var requestids = new Map();

function onRequest(details) {
  // if we are resolving urls
  if (!isResolving) {
    return
  }
  if (store.has(details.url) && !requestids.has(details.requestId)) {
    var chain = new Array();
    chain.push(details.url);
    requestids.set(details.requestId, chain);
  }
  var init = getInitial(details);
  var latest = getLatest(details);
  // TODO : change the condition based on the comparison between current and latest
  // or based on the number of redirects
  if(init && ( latest.length > shortenerLength || getChainLength(details) > nredirects)) {
    // resolve
    if (store.has(init)) {
      respond(getInitial(details), getChain(details));
    }
    // cancel the request
    return { cancel: true }; 
  }
}

function onRedirect(details) {
    // are we resolving and tracking this specific request id
    if(isResolving && requestids.has(details.requestId)) {
      var chain = requestids.get(details.requestId);
      chain.push(details.redirectUrl);
    }
}

function respond(url, chain) {
  // get the resolves for this url
  var resolves = store.get(url) || [];
  for (var i = 0; i < resolves.length; i++) {
    var r = resolves[i];
    r(chain);
  }
  store.delete(url);
}

function getChain(details) {
  return requestids.get(details.requestId) || [];
}

function getChainLength(details) {
  return requestids.get(details.requestId).length || 0;
}

function getInitial(details) {
  if (requestids.has(details.requestId)) {
    var chain = requestids.get(details.requestId);
    return chain[0];
  }
  return null;
}

function getLatest(details) {
  if (requestids.has(details.requestId)) {
    var chain = requestids.get(details.requestId);
    return chain[chain.length - 1];
  }
  return null;
}

function onResponse(details) {
    // are we getting a response for one of the requests that we're tracking
    if(isResolving && requestids.has(details.requestId)) {
      var url = getInitial(details);
      respond(url, getChain(details));
    }
}

function sendHeader(details) {
  if (isResolving ){
    details.requestHeaders['User-Agent'] = 'MyAgent'
    debugLog(details);
  }
}

// add listeners for the three events
browser.webRequest.onBeforeRequest.addListener(onRequest, { urls: ["<all_urls>"] });
browser.webRequest.onBeforeRedirect.addListener(onRedirect, { urls: ["<all_urls>"] });
browser.webRequest.onResponseStarted.addListener(onResponse, { urls: ["<all_urls>"] });
//browser.webRequest.onBeforeSendHeaders.addListener(sendHeader, { urls: ["<all_urls>"] });

// special handling for non-standard link shorteners such as t.co
var trex = new RegExp(/https?\:\/\/t.co\/.*/);
function istwitter(url) {
  return trex.test(url);
}

function getTwitter(url) {
    return new Promise(function (resolve, reject) {
      fetch(url)
        .then(response => response.text())
        .then(htmlstr => {
          var parser = new DOMParser();
          var doc = parser.parseFromString(htmlstr, "text/html");
          debugLog(doc);
          resolve([url, doc.title]);
        }).catch(err => reject(err))});
}

export function resolveURL(url) {
    if(!isResolving) {
        isResolving = true;
    }
    // handle special cases
    var match = istwitter(url);
    if(match) {
      return getTwitter(url);
    } else {
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
}