/**
 * Content script for link exposure study
 * @module WebScience.Studies.content-scripts.linkExposure
 */
// Function encapsulation to maintain unique variable scope for each content script
(
  async function () {
    /**
     * @const
     * updateInterval (number of milliseconds) is the interval at which we look for new links that users
     * are exposed to in known domains
     */
    const updateInterval = 2000;
    /**
     * @const
     * visibilityThreshold (number of milliseconds) is minimum number of milliseconds for link exposure
     */
    const visibilityThreshold = 10000; // TODO : Make this a configurable option which can be set during the setup
    const elementSizeCache = new Map();

    // First check private windows support
    let privateWindowResults = await browser.storage.local.get("WebScience.Studies.LinkExposure.privateWindows");
    if (("WebScience.Studies.LinkExposure.privateWindows" in privateWindowResults) &&
      !privateWindowResults["WebScience.Studies.LinkExposure.privateWindows"] &&
      browser.extension.inIncognitoContext) {
      return;
    }

    let shortDomainRegex = await browser.storage.local.get("shortDomainRegex");
    let domainRegex = await browser.storage.local.get("domainRegex");
    const shortURLMatcher = shortDomainRegex.shortDomainRegex;
    const urlMatcher = domainRegex.domainRegex;

    /** time when the document is loaded */
    let initialLoadTime = Date.now();
    /**
     * @function
     * Use document's visibility state to test if the document is visible
     * @returns {boolean} true if the document is visible
     */
    function isDocVisible() {
      return document.visibilityState === "visible";
    }

    // Elements that we checked for link exposure
    let checkedElements = new WeakMap();

    /**
     * Helper function to send data to background script
     * @param {string} type - message type
     * @param {Object} data - data to send
     * @returns {void} Nothing
     */
    function sendMessageToBackground(type, data) {
      if (data.length > 0) {
        let metadata = {
          location: document.location.href,
          loadTime: initialLoadTime,
          visible: isDocVisible(),
          referrer: document.referrer
        };
        browser.runtime.sendMessage({type: type, metadata: metadata, exposureEvents: data});
      }
    }

    // Caches : https://github.com/ampproject/amphtml/blob/master/build-system/global-configs/caches.json
    const cacheDomains = ["cdn.ampproject.org", "amp.cloudflare.com", "bing-amp.com"];
    const domRegex = /.*?\/{1,2}(.*?)(\.).*/gm;

    /**
     * Function to get publisher domain and actual url from a amp link
     * @param {string} url - the {@link url} to be resolved
     */
    function resolveAmpUrl(url) {
      // 1. check if url contains any of the cacheDomains
      for (let i = 0; i < cacheDomains.length; i++) {
        let domain = cacheDomains[i];
        // Does the url contain domain
        if (url.includes(domain)) {
          // extract the domain prefix by removing protocol and cache domain suffix
          //let domainPrefix = getDomainPrefix(url);
          let match = domRegex.exec(url);
          if (match != null) {
            let domainPrefix = match[1];
            //Punycode Decode the publisher domain. See RFC 3492
            //Replace any ‘-’ (hyphen) character in the output of step 1 with ‘--’ (two hyphens).
            //Replace any ‘.’ (dot) character in the output of step 2 with ‘-’ (hyphen).
            //Punycode Encode the output of step 3. See RFC 3492
            // Code below reverses the encoding
            // 1. replace - with . and -- with a -
            let domain = domainPrefix.replace("-", ".");
            // 2. replace two . with --
            domains = domain.replace("..", "--");
            domain = domain.replace("--", "-");
            // 3. get the actual url
            let split = url.split(domain);
            let sourceUrl = domain + split[1];
            let arr = url.split("/");
            return [domain, arr[0] + "//" + sourceUrl];
          }
        }
      }
      return [];
    }
    /**
     * @typedef {Object} Match
     * @property {string} url - normalized url
     * @property {Boolean} isMatched - domain matches 
     */

    /** 
     * Function takes an element, tests it for matches with link shorteners or domains of interest and
     * returns a Match object @see Match
     * @function
     * @param {Element} element - href to match for short links or domains of interest
     * @returns {Match} match true if the url matches domains
     */
    function matchUrl(element) {
      let url = relativeToAbsoluteUrl(element.href);
      let ret = removeShim(url);
      if (ret.isShim) {
        elementSizeCache.set(ret.url, getElementSize(element));
        url = ret.url;
      }
      let res = resolveAmpUrl(url);
      if (res.length > 0) {
        url = relativeToAbsoluteUrl(res[1]);
      }
      return {
        url: url,
        isMatched: shortURLMatcher.test(url) || urlMatcher.test(url)
      };
    }

    /**
     * Function to look for new <a> elements that are in viewport
     */
    function checkLinksInDom() {
      // check the visibility state of document
      if (!isDocVisible()) {
        return;
      }
      let exposureEvents = [];
      // Get <a> elements and either observe (for new elements) or send them to background script if visible for > threshold
      Array.from(document.body.getElementsByTagName("a")).filter(link => link.hasAttribute("href")).forEach(element => {
        // if we haven't seen this <a> element
        if (!checkedElements.has(element)) {
          const {
            url,
            isMatched
          } = matchUrl(element);
          if (!isMatched) {
            // add this unmatched url to the map of checked urls
            checkedElements.set(element, false);
            return;
          }
          let status = new ElementStatus(url);
          status.setMatched();
          checkedElements.set(element, status);
          observer.observe(element);
        } else {
          let status = checkedElements.get(element);
          // if we have seen and the element is visible for atleast threshold milliseconds
          if (status && status.isVisibleAboveThreshold(visibilityThreshold) && !status.isIgnored()) {
            // send <a> element this to background script
            exposureEvents.push({
              originalUrl: status.url,
              size: getElementSize(element),
              firstSeen: status.visibility,
              duration: status.getDuration()
            });
            observer.unobserve(element);
            status.setIgnore();
          }
        }
      });
      sendMessageToBackground("WebScience.linkExposure", exposureEvents);
    }

    /** callback for IntersectionObserver */
    function handleIntersection(entries, observer) {
      entries.forEach(entry => {
        const {
          isIntersecting,
          target
        } = entry;
        let status = checkedElements.get(target);
        if (isIntersecting && isElementVisible(target)) {
          status.setVisibility();
        } else if (!isIntersecting && checkedElements.has(target) && checkedElements.get(target).visibility !== null) {
          status.setIgnore();
          status.setDuration();
          observer.unobserve(target);
        }
      });
    }

    // Options for intersection observer
    const options = {
      threshold: 1
    };
    const observer = new IntersectionObserver(handleIntersection, options);

    /**
     * @classdesc
     * Keeps track of various properties of Elements
     */
    class ElementStatus {
      constructor(url) {
        this.url = url;
        this.matched = false;
        this.visibility = null;
        this.visibleDuration = 0;
        this.ignore = false;
      }

      /**
       * @returns {boolean} true if element is ignored
       */
      isIgnored() {
        return this.ignore;
      }

      setIgnore() {
        this.ignore = true;
      }

      /**
       * @returns {boolean} true if element is matched
       */
      isMatched() {
        return this.matched;
      }

      setMatched() {
        this.matched = true;
      }
      /**
       * Checks if the element time since exceeds certain threshold
       * @param {number} threshold number of milliseconds
       */
      isVisibleAboveThreshold(threshold) {
        return this.visibility != null && (Date.now() >= this.visibility + threshold);
      }
      /**
       * Sets visibility to the current
       */
      setVisibility() {
        this.visibility = Date.now();
      }

      /**
       * @returns {number} number of milliseconds since visibility was set
       */
      getDuration() {
        return Date.now() - this.visibility;
      }
      setDuration() {
        if (this.visibility != null) {
          this.visibleDuration = Date.now() - this.visibility;
        }
      }
    }

    let timer = setInterval(() => run(), updateInterval);
    let maxUpdates = -1;
    let numUpdates = 0;

    function run() {
      if (maxUpdates >= 0 && numUpdates >= maxUpdates) {
        clearInterval(timer);
      }
      checkLinksInDom();
      numUpdates++;
    }

  } // end of anon function
)(); // encapsulate and invoke