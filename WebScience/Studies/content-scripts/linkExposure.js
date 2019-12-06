// Function encapsulation to maintain unique variable scope for each content script
(
  function() {
    // Wait for 5 seconds for the dom load (after document idle)
    setTimeout(x, 5000);
    // setup listeners and setInterval to observe changes to the dom
  function x() {
  // Save the time the page initially completed loading
  let initialLoadTime = Date.now();
  let initialVisibility = document.visibilityState == "visible";

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
        width: rect.right - rect.left,
        height: rect.bottom - rect.top
      };
    }

    function getShortLinks(aElements) {
      return Array.filter(Array.from(aElements), (ele) => { return testForMatch(shortURLMatcher, ele.href, ele); }).map((x) => { return { href: x.href } });
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

  function update() {
    //var aElements = document.body.querySelectorAll("a[href]");
    // href that doesn't have the expando attribute
    let aElements = Array.filter(document.body.querySelectorAll("a[href]"), (x) => !x.hasAttribute("_visited") && isElementInViewport(x)).map((x) => {
      x.setAttribute("_visited", "");
      return x;
    });
    let matchingLinks = getDomainMatches(aElements);
    let shortLinks = getShortLinks(aElements);

    sendMessageToBg("WebScience.shortLinks", shortLinks);
    sendMessageToBg("WebScience.linkExposureInitial", matchingLinks);
  }

  // call update every 2 seconds
  setInterval(update, 2000);

    browser.runtime.onMessage.addListener((data, sender) => {
      console.log("Message from the background script:");
      console.log(data.links);
      // get domain matching links from texpanded links
      let newlinks = Array.from(data.links).map(x => { return { href: x.v[x.v.length - 1], init: x.v[0] } }).filter(link => testForMatch(urlMatcher, link.href));
      // send the new filtered links to background script for storage
      sendMessageToBg("WebScience.linkExposureInitial", getLinkSize(newlinks));
      return Promise.resolve({ response: "received messages" });
    });
  }
}
)();