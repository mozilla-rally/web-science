// Function encapsulation to maintain unique variable scope for each content script
(
  function() {
    /**
     * @const
     * updateInterval (number of milliseconds) is the interval at which we look for new links that users
     * are exposed to in known domains
     */
    const updateInterval = 2000;
    const elementSizeCache = new Map();
    //let shortURLMatcher2 = null;
    //let urlMatcher2 = null;
    linkExposure();

  /**
   * @function
   * linkExposure function looks for the presence of links from known domains
   * in the browser viewport and sends this information to the background script.
   */
  function linkExposure() {

    let shortURLMatcher = null;
    let urlMatcher = null;
    async function init() {
      let sdrs = await browser.storage.local.get("shortDomainRegexString");
      let drs = await browser.storage.local.get("domainRegexString");
      return { shortURLMatcher : new RegExp(sdrs.shortDomainRegexString), urlMatcher : new RegExp(drs.domainRegexString)};
    }

    init().then(regex => {
      shortURLMatcher = regex.shortURLMatcher;
      urlMatcher = regex.urlMatcher;
    });


    /** time when the document is loaded */
    let initialLoadTime = Date.now();
    /**
     * @function
     * Use document's visibility state to test if the document is visible
     * @returns {boolean} true if the document is visible
     */
    const isDocVisible = () => document.visibilityState === "visible";
    let initialVisibility = document.visibilityState == "visible";
    
    // Elements that we've checked for link exposure
    let checkedElements = new WeakSet();

    /**
     * Helper function to send data to background script
     * @param {string} type - message type
     * @param {Object} data - data to send
     * @returns {void} Nothing
     */
    function sendMessageToBackground(type, data) {
      if(data.length > 0) {
        browser.runtime.sendMessage({
          type: type,
          loadTime: initialLoadTime,
          visible: initialVisibility,
          url: document.location.href,
          referrer: document.referrer,
          links: data,
        });
      }
    }

    /**
     * Function takes an <a> element, test it for matches with link shorteners or domains of interest and
     * sends it to background script for resolution/storage
     * @param {HTMLElement} element - element to match for short links or domains of interest
     * @returns {void} Nothing
     */
    function matchElement(element) {
      let url = rel_to_abs(element.href);
      let ret = removeShim(url);
      if(ret.isShim) {
        elementSizeCache.set(ret.url, getElementSize(element));
        url = ret.url;
      }
      let res = resolveAmpUrl(url);
      if(res.length > 0) {
        url = rel_to_abs(res[1]);
      }
      if (shortURLMatcher.test(url)) {
        sendMessageToBackground("WebScience.shortLinks", [{ href: url }]);
      }
      // check for domain matching
      if (urlMatcher.test(url)) {
        sendMessageToBackground("WebScience.linkExposure", [{ href: url, size: getElementSize(element) }]);
      }
    }

    /**
     * Function to look for new <a> elements that are in viewport
     * @returns {int} number of new links in the viewport
     */
    function observeChanges() {
      // check the visibility state of document
      if(!isDocVisible()) {
        return;
      }
      // Filter for elements that haven't been visited previously and observe them with intersection observer
      let count = 0;
      Array.from(document.body.querySelectorAll("a[href]")).filter(link => !checkedElements.has(link)).forEach(element => {
        observer.observe(element);
      });
      return count;
    }

  function handleIntersection(entries, observer) {
      entries.forEach(entry => {
        const {isIntersecting, target} = entry;
        if (isIntersecting && elemIsVisible(target)) {
          checkedElements.add(target);
          matchElement(target);
          observer.unobserve(target);
        }
      });
    }
    
    const options = { threshold: 1 };
    const observer = new IntersectionObserver(handleIntersection, options);
    /**
     * @classdesc
     * UpdateHandler class to observe the document for changes in specified time
     * intervals. It also stores the number of changes in the last ncalls.
     * 
     */
    class UpdateHandler {
      /**
       * @constructor
       * @param {int} updateInterval - number of milliseconds between updates
       * @param {int} numUpdates - maximum number of updates. ** Negative number implies function doesn't stop
       * @param {int} nrecords - maximum number of results stored
       */
      constructor(updateInterval, numUpdates, nrecords=10) {
        /** @member {int} - number of milliseconds */
        this.updateInterval = updateInterval;
        /** @member {int} - maximum number of updates or unlimited if negative */
        this.numUpdates = numUpdates;
        /** @member {int} - Number of times update has run */
        this.count = 0;
        /** @member {Array} - Number of links discovered in each run */
        this.nlinks = [];
        /** @member {int} - History length to maintain */
        this.nrecords = nrecords;
      }
      /**
       * calls the run method every @see run
       * @return {void} Nothing
       */
      start() {
        this.timer = setInterval(() => this.run(), this.updateInterval);
      }
      /**
       * stops the execution of @see run method
       */
      stop() {
        if(this.timer) clearInterval(this.timer);
      }
      /**
       * run function stops timer if it reached max number of updates
       * Otherwise, we look for changes in the document by invoking
       * observeChanges function
       * @function
       */
      run() {
        if(this.numUpdates > 0 && this.count >= this.numUpdates) {
          this.stop();
        }
        let nchanges = observeChanges();
        if (this.nlinks.length >= this.nrecords) {
          this.nlinks.shift();
        }
        this.nlinks.push(nchanges);
        this.count++;
      }
    }
    
    let handler = new UpdateHandler(updateInterval, -1);
    handler.start();

    /**
     * @function
     * callback function for link resolution response messages from background script
     * Each message is an object containing source and dest is the url after resolution
     * @param {Object} message - object containing source and dest fields
     * @param {*} sender - sender of the message
     * @returns {void} Nothing
     */
    function listenerForLinkResolutionResponse(message, sender) {
      let source = message.source;
      let dest = message.dest;
      if (urlMatcher.test(dest)) {
        // get source size
        let sz = getLinkSize(source);
        if(sz == null) {
          // check in cache
          sz = elementSizeCache.has(source) ? elementSizeCache.get(source) : null;
          // remove the url from cache
          elementSizeCache.delete(source);
        }
        let data = [{ href: dest, size: sz }];
        sendMessageToBackground("WebScience.linkExposure", data);
      }
      return Promise.resolve({ response: "cs received messages" });
    }

    browser.runtime.onMessage.addListener(listenerForLinkResolutionResponse);
  } // End of link exposure function
} // end of anon function
)(); // encapsulate and invoke