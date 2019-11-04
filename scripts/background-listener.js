  // background-script.js

function setUrl() {
    console.log("OK");
}

function onError(error) {
    console.log(error)
}

function handleMessage(request, sender, sendResponse) {  
    console.log("received a message");
    // get local time
    var now = new Date;
    var ts = now.getTime();
    var link = {
        urls: request.data,
        time: ts,
    }
    // get current data or empty array if it doesn't exist
    obj = {};
    obj[ts] = link;
    browser.storage.local.set(obj).then(setUrl, onError);
    setTimeout(() => {
      sendResponse({response: link});
    }, 1000);  
    return true;
  }
  
  browser.runtime.onMessage.addListener(handleMessage);

  // download stats

function dl() {
    chrome.storage.local.get(null, function (items) {
        var blob = new Blob([JSON.stringify(items, null, '  ')], { type: "text/plain" });
        var url = URL.createObjectURL(blob);
        chrome.tabs.create({ url: url }); // requires that the extension has the "tabs" permission
        //chrome.downloads.download({ url: url }); // requires that the extension has the "downloads" permission
    });
}
  browser.browserAction.onClicked.addListener((tab) => {
    // disable the active tab
    browser.browserAction.disable(tab.id);
    // requires the "tabs" or "activeTab" permission
    dl();
  });