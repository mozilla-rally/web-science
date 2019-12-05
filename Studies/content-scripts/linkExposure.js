// Function encapsulation to maintain unique variable scope for each content script
(setTimeout(function() {

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


// Helper function to test if the hostname matches to a known domain
function testForMatch(matcher, link, element=null) {
  // if element is not null check if its in the viewport
  return (element == null || isElementInViewport(element)) && matcher.test(link);
}

// Helper function to test if DOM element is in viewport
function isElementInViewport (el) {
  var rect = el.getBoundingClientRect();
  return (
      rect.top > 0 && // should this be strictly greater ? With >= invisible links have 0,0,0,0 in bounding rect
      rect.left > 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /*or $(window).height() */
      rect.right <= (window.innerWidth || document.documentElement.clientWidth) /*or $(window).width() */
  );
}

// Helper function to get size of element
function getElementSize(el) {
  var rect = el.getBoundingClientRect();
  return {
    width : rect.right-rect.left,
    height : rect.bottom-rect.top
  };
}

//var test = Array.filter(Array.from(aElements), element => testForMatch(shortURLMatcher, element.href));
/*let items = Array.from(aElements);
let filtered = items.filter((item) => {
  return testForMatch(shortURLMatcher, item.href);
});*/
//alert(filtered);

  function getShortLinks(aElements) {
    return Array.filter(Array.from(aElements), (ele) => { return testForMatch(shortURLMatcher, ele.href, ele); }).map((x) => { return { href: x.href} });
  }
  function getDomainMatches(aElements) {
    return Array.filter(Array.from(aElements), (ele) => { return testForMatch(urlMatcher, ele.href, ele); }).map((x) => { return { href: x.href, size: getElementSize(x) } });
  }

  function sendMessageToBg(type, data) {
    if(data.length > 0) {
      browser.runtime.sendMessage({
        type: type,
        content: {
          loadTime: initialLoadTime,
          visible: initialVisibility,
          url: document.location.href,
          referrer: document.referrer,
          links: data,
        }
      });
    }
  }

  function getLinkSize(newlinks) {
    // create an object with key = init and value is resolved url
    var assoc = {};
    newlinks.forEach((key, i) => assoc[key.init] = key.href);
    var query = newlinks.map(x => { return ["a[href='", x.init, "']"].join("");}).join(",");
    var elements = document.body.querySelectorAll(query);
    var data = Array.from(elements).map(x => {
      return {href: assoc[x.href], size: getElementSize(x)}
    });
    return data;
  }

var aElements = document.body.querySelectorAll("a[href]");
var matchingLinks = getDomainMatches(aElements);
var shortLinks = getShortLinks(aElements);

sendMessageToBg("WebScience.shortLinks", shortLinks);
sendMessageToBg("WebScience.linkExposureInitial", matchingLinks);

  browser.runtime.onMessage.addListener((data, sender) => {
    console.log("Message from the background script:");
    console.log(data.links);
    // get domain matching links from texpanded links
    var newlinks = Array.from(data.links).map(x => { return { href: x.v[x.v.length - 1], init: x.v[0] } }).filter(link => testForMatch(urlMatcher, link.href));
    // send the new filtered links to background script for storage
    sendMessageToBg("WebScience.linkExposureInitial", getLinkSize(newlinks));
    return Promise.resolve({ response: "received messages" });
  });

function fb_decode(url) {
  var u = new URL(url);
  // this is for facebook posts
  hasU = u.searchParams.get('u') != null;
  if(hasU) {
      return u.searchParams.get("u").split('?')[0];
  }
  return u.href;
}

}, 1000))();