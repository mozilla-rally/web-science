// Function encapsulation to maintain unique variable scope for each content script
(async function() {

// If the Navigation study is configured to not measure in private windows, and
// this is a private window, do nothing
var privateWindowResults = await browser.storage.local.get("WebScience.Studies.Navigation.privateWindows");
if(("WebScience.Studies.Navigation.privateWindows" in privateWindowResults)
    && !privateWindowResults["WebScience.Studies.Navigation.privateWindows"]
    && browser.extension.inIncognitoContext)
    return;

browser.runtime.sendMessage({
    type: "WebScience.Studies.Navigation.referrerUpdate",
    referrer: document.referrer
});

})();
