function handleResponse(message) {
  console.log(`Message from the background script:  ${message.response}`);
}

function handleError(error) {
  console.log(`Error: ${error}`);
}

function notifyBackgroundPage(ref) {
  console.log("sending to bg "+ref);
  var sending = browser.runtime.sendMessage({ "data": ref });
  sending.then(handleResponse, handleError);  
}

function displayStorage() {
  var gettingStoredStats = browser.storage.local.get();
  gettingStoredStats.then(results => { alert("stored url "+results.url)});
}

// store all the news links observed
var links = new Array();

function sendLinks() {
  links = unique(links, "url");
  data = [];
  for(let i=0; i < links.length; i++) {
    data[i] = links[i];
  }
  // remove duplicates from data
  if(data.length > 0 ) {
    notifyBackgroundPage(data);
    // clear the array
    links.splice(0, links.length);
  }
}

// send the links every n seconds
setInterval(sendLinks, 1000);

function findNews (doc) {
  var ns = getNewsLinks(doc);
  if (ns.length > 0) {
    alert("Number of news links " + ns.length);
    links.concat(ns);
  }
}
// find news links
findNews(document);

const observer = new MutationObserver((mutations) => {
  //alert("mutations");
  mutations.forEach((mutation) => {
    if (mutation.addedNodes && mutation.addedNodes.length > 0) {
      for (let i = 0; i < mutation.addedNodes.length; i++) {
        const newNode = mutation.addedNodes[i];
        if(newNode.hasChildNodes()) {
          var list = newNode.getElementsByTagName("a");
          if(list.length > 0) {
            for(let j = 0; j < list.length; j++) {
              ref = list[j].getAttribute("href");
              if(isHrefNewsLink(ref)) {
              links.push({
                  "domain" : "mutation host",
                  "url" : ref
              });
              }
            }
          }
        }
      }
    }
  });
});
observer.observe(document.body, {
  childList: true,
  subtree: true
});
