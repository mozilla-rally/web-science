browser.runtime.sendMessage({
  type: "WebScience.pageContentUpdate",
  content: {
    pageContent: document.documentElement.outerHTML
  }
});
