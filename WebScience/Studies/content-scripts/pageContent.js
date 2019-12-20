// Function encapsulation to maintain unique variable scope for each content script
(function() {

browser.runtime.sendMessage({
  type: "WebScience.pageContentUpdate",
  pageContent: document.documentElement.outerHTML
});

})();
