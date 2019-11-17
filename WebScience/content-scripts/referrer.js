browser.runtime.sendMessage({
  type: "WebScience.referrerUpdate",
  content: {
    referrer: document.referrer
  }
});
