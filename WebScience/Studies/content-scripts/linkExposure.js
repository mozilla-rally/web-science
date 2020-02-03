/**
 * Content script for link exposure study
 * @module WebScience.Studies.content-scripts.linkExposure
 */
// Function encapsulation to maintain unique variable scope for each content script
(
  function () {
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
    linkExposure();

    /**
     * @function
     * linkExposure function looks for the presence of links from known domains
     * in the browser viewport and sends this information to the background script.
     */
    async function linkExposure() {

      /**
       * Checks if the script should exit because private windows are not supported for LinkExposure
       * @returns {boolean} - true if private windows are not supported
       */
      async function checkPrivateWindowSupport() {
        let privateWindowResults = await browser.storage.local.get("WebScience.Studies.LinkExposure.privateWindows");
        return ("WebScience.Studies.LinkExposure.privateWindows" in privateWindowResults) &&
          !privateWindowResults["WebScience.Studies.LinkExposure.privateWindows"] &&
          browser.extension.inIncognitoContext;
      }

      /**
       * Initializes the script by constructing regular expressions for matching domains and short domains
       * @returns {Object} regular expressions for matching domains and short domains
       */
      async function init() {
        let sdrs = await browser.storage.local.get("shortDomainRegexString");
        let drs = await browser.storage.local.get("domainRegexString");
        return {
          shortURLMatcher: new RegExp(sdrs.shortDomainRegexString),
          urlMatcher: new RegExp(drs.domainRegexString),
        };
      }

      // First check private windows support
      let isExit = await checkPrivateWindowSupport();
      if (isExit) {
        return;
      }

      // Initialize the script
      const {
        shortURLMatcher,
        urlMatcher,
      } = await init();

      /** time when the document is loaded */
      let initialLoadTime = Date.now();
      /**
       * @function
       * Use document's visibility state to test if the document is visible
       * @returns {boolean} true if the document is visible
       */
      const isDocVisible = () => document.visibilityState === "visible";
      let initialVisibility = document.visibilityState == "visible";

      // Elements that we checked for link exposure
      let checkedElements = new WeakMap();

      /**
       * Helper function to send data to background script
       * @param {string} type - message type
       * @param {Object} data - data to send
       * @returns {void} Nothing
       */
      function sendMessageToBackground(type, data) {
        if (data) {
          browser.runtime.sendMessage({
            type: type,
            loadTime: initialLoadTime,
            visible: initialVisibility,
            url: document.location.href,
            referrer: document.referrer,
            link: data,
          });
        }
      }

      /**
       * @typedef {Object} Match
       * @property {string} url - normalized url
       * @property {Boolean} isMatched - domain matches 
       * 
       * Function takes an element, tests it for matches with link shorteners or domains of interest and
       * @param {Element} element - href to match for short links or domains of interest
       * @returns {Match} match true if the url matches domains
       */
      function matchUrl(element) {
        let url = rel_to_abs(element.href);
        let ret = removeShim(url);
        if (ret.isShim) {
          elementSizeCache.set(ret.url, getElementSize(element));
          url = ret.url;
        }
        let res = resolveAmpUrl(url);
        if (res.length > 0) {
          url = rel_to_abs(res[1]);
        }
        return {
          url: url,
          isMatched: shortURLMatcher.test(url) || urlMatcher.test(url)
        };
      }

      /**
       * Function to look for new <a> elements that are in viewport
       */
      function observeChanges() {
        // check the visibility state of document
        if (!isDocVisible()) {
          return;
        }
        // Get <a> elements and either observe (for new elements) or send them to background script if visible for > threshold
        Array.from(document.body.getElementsByTagName("a")).filter(link => link.hasAttribute("href")).forEach(element => {
          // if we haven't seen this <a> element
          if (!checkedElements.has(element)) {
            const {
              url,
              isMatched
            } = matchUrl(element);
            if (!isMatched) {
              return;
            }
            let status = new ElementStatus(url);
            status.setMatched();
            checkedElements.set(element, status);
            observer.observe(element);
          } else {
            let status = checkedElements.get(element);
            // if we have seen and the element is visible for atleast threshold milliseconds
            if (status.isVisibleAboveThreshold(visibilityThreshold) && !status.isIgnored()) {
              // send <a> element this to background script
              sendMessageToBackground("WebScience.linkExposure", {
                href: status.url,
                size: getElementSize(element),
                firstSeen: status.visibility,
                duration: status.getDuration()
              });
              observer.unobserve(element);
              status.setIgnore();
            }
          }
        });
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
        constructor(updateInterval, numUpdates) {
          /** @member {int} - number of milliseconds */
          this.updateInterval = updateInterval;
          /** @member {int} - maximum number of updates or unlimited if negative */
          this.numUpdates = numUpdates;
          /** @member {int} - Number of times update has run */
          this.count = 0;
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
          if (this.timer) clearInterval(this.timer);
        }
        /**
         * run function stops timer if it reached max number of updates
         * Otherwise, we look for changes in the document by invoking
         * observeChanges function
         * @function
         */
        run() {
          if (this.numUpdates > 0 && this.count >= this.numUpdates) {
            this.stop();
          }
          observeChanges();
          this.count++;
        }
      }

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

      let handler = new UpdateHandler(updateInterval, -1);
      handler.start();

    } // End of link exposure function
  } // end of anon function
)(); // encapsulate and invoke