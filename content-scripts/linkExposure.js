// Save the time the page initially completed loading
var initialLoadTime = Date.now();

// Save whether the page was initially visible
// Note that the Page Visibility API only handles if a tab is active in its window,
// we have to separately check in the content script whether the window is active
var initialVisibility = document.visibilityState == "visible";

// TODO check if the Page Visibility API properly handles when a tab is active in
// its browser window but the window isn't focused

// Get all the links on the page that have an href attribute
// Not that this is using the slower querySelectorAll, which returns a static NodeList
// We might want to use the faster getElement, which returns a live (possibly risky) HTMLCollection
// We also might want to try embedding the domains into the CSS selector
var aElements = document.body.querySelectorAll("a[href]");

var matchingLinks = [ ];

// Check each link for whether the href matches a domain in the study
for(var aElement of aElements) {

  // Use a DOM expando attribute to label a tags with whether the domain matches
  aElement.linkExposureMatchingDomain = domainMatcher.test(aElement.href);

  if(aElement.linkExposureMatchingDomain) {
    matchingLinks.push(aElement.href);
  }
}

browser.runtime.sendMessage({
  type: "WebScience.linkExposureInitial",
  content: {
    loadTime: initialLoadTime,
    visible: initialVisibility,
    url: document.location.href,
    referrer: document.referrer,
    links: matchingLinks
  }
});
