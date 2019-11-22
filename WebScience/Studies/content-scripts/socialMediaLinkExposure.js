// Function encapsulation to maintain unique variable scope for each content script
(function() {

// Save the time the page initially completed loading
var initialLoadTime = Date.now();

// Save whether the page was initially visible
// Note that the Page Visibility API only handles if a tab is active in its window,
// we have to separately check in the content script whether the window is active
var initialVisibility = document.visibilityState == "visible";

// Get all the links on the page that have an href attribute
// Not that this is using the slower querySelectorAll, which returns a static NodeList
// We might want to use the faster getElement, which returns a live (possibly risky) HTMLCollection
// We also might want to try embedding the matching domains into the CSS
//  selector, which might be faster
var aElements = document.body.querySelectorAll("a[href]");

var matches = [];

// Helper function to test if the hostname matches to a known domain
function testForMatch(matcher, link) {
  return matcher.test(link)
}

// Helper function to test if DOM element is in viewport
function isElementInViewport (el) {
  //if we are using jquery
  if (typeof jQuery === "function" && el instanceof jQuery) {
      el = el[0];
  }
  var rect = el.getBoundingClientRect();
  return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /*or $(window).height() */
      rect.right <= (window.innerWidth || document.documentElement.clientWidth) /*or $(window).width() */
  );
}

// helper function for parsing fb urls
function fb_decode(url) {
  var u = new URL(url);
  // this is for facebook posts
  hasU = u.searchParams.get('u') != null;
  if(hasU) {
      return u.searchParams.get("u").split('?')[0];
  }
  return "";
}

// Check each link for whether the href matches a domain in the study
for(var aElement of aElements) {


  // Test for short domains that are in the viewport
  // Test case : navigate to https://support.google.com/faqs/answer/190768?hl=en
  if(testForMatch(smURLMatcher, aElement.href) && isElementInViewport(aElement) && fb_decode(aElement.href)) {
    matches.push([aElement.href, fb_decode(aElement.href)]);
    continue;
  }
}

if(matches.length > 0) {
  browser.runtime.sendMessage({
    type: "WebScience.socialMediaLinkExposureInitial",
    content: {
      loadTime: initialLoadTime,
      visible: initialVisibility,
      url: document.location.href,
      referrer: document.referrer,
      smmatcher: shortURLMatcher,
      links: matches
    }
  });
}


})();
