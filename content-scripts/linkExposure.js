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
// We also might want to try embedding the matching domains into the CSS selector, which might be faster
var aElements = document.body.querySelectorAll("a[href]");

var matchingLinks = [ ];

// Check each link for whether the href matches a domain in the study
for(var aElement of aElements) {

  // Use a DOM expando attribute to label a tags with whether the domain matches
  aElement.linkExposureMatchingDomain = domainMatcher.test(aElement.href);

  // TODO check that we aren't missing href attributes that omit the current domain
  // e.g., <a href="/foo/bar.html">

  if(aElement.linkExposureMatchingDomain) {
    matchingLinks.push(aElement.href);
  }
}

// TODO implement a better data model, such as link exposure tracking within the
// content script that sends the full set of link exposure data when the page
// is unloading (e.g., with window.addEventListener("beforeunload", ...))
if(matchingLinks.length > 0) {
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
}

// TODO add logic to handle link presentation/redirection quirks, including:
// * Facebook - e.g., https://l.facebook.com/l.php?u=... this should be
//   straightforward, just parsing the URL out of a parameter
// * Twitter - this is tricky... it looks like if a tweet body includes a URL,
//   then the original URL is included in <a title=..., but if a tweet only
//   includes a media object (e.g., the author deleted the URL after the story
//   attached to the tweet), then there's only a hostname in the media object
//   and a t.co URL to resolve... one option for the time being would be to grab
//   the URL if it's availabile and the hostname if it isn't... another option
//   would be to provide a service in the background page that resolves
//   shortened URLs (note that we can't do this in a content script because of
//   CORS)
// * Google Search - e.g., https://www.google.com/url?... this should be
//   straightforward URL parameter parsing
// * Google News - this is also tricky, since it looks like the article URL
//   is embedded with some unusual twist on base64url encoding (e.g.,
//   https://news.google.com/articles/...)

// TODO add logic to handle new a tags added to the DOM, would start with
// periodicially iterating the a tags and ignoring tags we've already tagged with
// an expando attribute

// TODO add logic to handle href attribute changes in a tags we've already seen
// This might be overkill... it probably doesn't come up much

// TODO add logic to check whether an a tag is visible to the user (e.g.,
// compare the viewport to getBoundingClientRect)

// TODO add logic to check the visual size of the tag (e.g., get dimensions
// from getBoundingClientRect)

// TODO add logic to monitor for when a tags enter or exit the user's view
// (e.g., iterate tags of interest checking the viewport or use an
// IntersectionObserver on those tags

})();
