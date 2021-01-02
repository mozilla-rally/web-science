/**
 * Content script for link exposure study
 * @module WebScience.Measurements.content-scripts.linkExposure
 */

// Function encapsulation to maintain unique variable scope for each content script
(async function () {

    let observer = null;

    /**
     * The ID for a timer to periodically check links.
     * @type {number}
     */
    let timer = 0;

    // Async calls come before the event handlers to avoid race conditions if a
    // new page loads with the same document (i.e., via the History API)
    let privateWindowResults = await browser.storage.local.get("WebScience.Measurements.LinkExposure.privateWindows");
    let shortDomainRegex = await browser.storage.local.get("shortDomainRegex");
    let linkRegex = await browser.storage.local.get("linkRegex");
    let ampDomainRegex = await browser.storage.local.get("ampDomainRegex");
    
    // Inner function encapsulation to wait for PageManager load
    let pageVisitStartListener = function ({ timeStamp }) {
        /**
         * @constant
         * updateInterval (number of milliseconds) is the interval at which we look for new links that users
         * are exposed to in known domains
         */
        const updateInterval = 2000;
        /**
         * @constant
         * visibilityThreshold (number of milliseconds) is minimum number of milliseconds for link exposure
         */
        let visibilityThresholds = [1000, 3000, 5000, 10000]; // match to BG page
        /**
         * @constant
         * minimum link width for link exposure
         */
        const linkWidthThreshold = 25;
        /**
         * @constant
         * minimum link height for link exposure
         */
        const linkHeightThreshold = 15;
        const elementSizeCache = new Map();

        let numUntrackedUrlsByThreshold = {};
        for (let visThreshold of visibilityThresholds) {
            numUntrackedUrlsByThreshold[visThreshold] = 0;
        }
        let newUntracked = false;

        let lastLostAttention = -1;
        let lastGainedAttention = -1;

        // First check private windows support
        if (("WebScience.Measurements.LinkExposure.privateWindows" in privateWindowResults) &&
            !privateWindowResults["WebScience.Measurements.LinkExposure.privateWindows"] &&
            browser.extension.inIncognitoContext) {
            return;
        }

        const shortURLMatcher = shortDomainRegex.shortDomainRegex;
        const urlMatcher = linkRegex.linkRegex;

        let currentDomain = getDomain(document.URL);

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
        function sendExposureEventsToBackground(type, data) {
            if (data.length > 0 || newUntracked) {
                let metadata = {
                    location: PageManager.url,
                    loadTime: PageManager.pageVisitStartTime,
                    visible: isDocVisible(),
                    referrer: PageManager.referrer,
                    pageId: PageManager.pageId
                };
                let updateUntrackedUrls = numUntrackedUrlsByThreshold;
                newUntracked = false;
                browser.runtime.sendMessage({
                    type: type,
                    metadata: metadata,
                    exposureEvents: data,
                    numUntrackedUrls: updateUntrackedUrls
                }).then (() => {
                    for (var visThreshold of visibilityThresholds) {
                        numUntrackedUrlsByThreshold[visThreshold] = 0;
                    }
                });
            }
        }

        const ampDomainMatcher = ampDomainRegex.ampDomainRegex;
        /**
         * @const
         * Regular expression for extracting the amp domain and url
         */
        const ampDomainPrefixRegex = /.*?\/{1,2}(.*?)(\.).*/;

        /**
         * Function to get publisher domain and actual url from a amp link
         * https://amp.dev/documentation/guides-and-tutorials/learn/amp-caches-and-cors/amp-cache-urls/
         *
         * @param {string} url - the {@link url} to be resolved
         * @param {ampResolutionResult} - result of amp resolution
         * @param {string} ampResolutionResult.domain - cache domain
         * @param {url} ampResolutionResult.url - deampd url
         */
        function resolveAmpUrl(url) {
            // Does the url contain ampdomain
            if (ampDomainMatcher.test(url)) {
                // extract the domain prefix by removing protocol and cache domain suffix
                let match = ampDomainPrefixRegex.exec(url);
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
                    return {
                        domain: domain,
                        url: arr[0] + "//" + sourceUrl
                    };
                }
            }
            return undefined;
        }

        /**
         * Helper function to get size of element
         * @param {Element} element element
         * @returns Object with width and height of element
         */
        function getElementSize(element) {
            let rect = element.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height
            };
        }

        /**
         * Helper function to see if the size object meets width and height thresholds
         * @param {Object} size of element
         * @returns {boolean} true if the size is greater in width and height
         */
        function checkElementSizeThreshold(size) {
            return size.width >= linkWidthThreshold && size.height >= linkHeightThreshold;
        }

        /**
         * Helper function to check if Element is visible based on style and bounding rectangle
         * @param {Element} element element
         * @returns {boolean} true if the element is visible
         */
        function isElementVisible(element) {
            const st = window.getComputedStyle(element);
            let ret = (
                element &&
                st &&
                st.display && st.display !== "none" &&
                st.opacity && st.opacity !== "0"
            );
            return ret;
        }

        function getDomain(url) {
            var urlObj = new URL(url);
            return urlObj.hostname;
        }

        /**
         * Convert relative url to abs url
         * @param {string} url
         * @returns {string} absolute url
         */
        function relativeToAbsoluteUrl(url) {
            /* Only accept commonly trusted protocols:
             * Only data-image URLs are accepted, Exotic flavours (escaped slash,
             * html-entitied characters) are not supported to keep the function fast */
            if (/^(https?|file|ftps?|mailto|javascript|data:image\/[^;]{2,9};):/i.test(url))
                return url; //Url is already absolute

            var base_url = location.href.match(/^(.+)\/?(?:#.+)?$/)[0] + "/";
            if (url.substring(0, 2) == "//")
                return location.protocol + url;
            else if (url.charAt(0) == "/")
                return location.protocol + "//" + location.host + url;
            else if (url.substring(0, 2) == "./")
                url = "." + url;
            else if (/^\s*$/.test(url))
                return ""; //Empty = Return nothing
            else url = "../" + url;

            url = base_url + url;
            var i = 0;
            while (/\/\.\.\//.test(url = url.replace(/[^\/]+\/+\.\.\//g, "")));

            /* Escape certain characters to prevent XSS */
            url = url.replace(/\.$/, "").replace(/\/\./g, "").replace(/"/g, "%22")
                .replace(/'/g, "%27").replace(/</g, "%3C").replace(/>/g, "%3E");
            return url;
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
            let ampResolvedUrl = resolveAmpUrl(url);
            if (ampResolvedUrl !== undefined) {
                url = relativeToAbsoluteUrl(ampResolvedUrl.url);
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
            const currentTime = Date.now();
            if (!isDocVisible()) {
                return;
            }
            // if we don't have attention it's been more than updateInterval since we lost it
            if (!PageManager.pageHasAttention && (lastLostAttention + updateInterval < currentTime)) {
                return;
            }
            updateTime = PageManager.pageHasAttention ? currentTime : lastLostAttention;
            let exposureEvents = [];
            // Get <a> elements and either observe (for new elements) or send them to background script if visible for > threshold
            Array.from(document.body.querySelectorAll("a[href]")).forEach(element => {
                // if we haven't seen this <a> element
                if (!checkedElements.has(element)) {
                    const {
                        url,
                        isMatched
                    } = matchUrl(element);
                    const elementSize = getElementSize(element);
                    if (currentDomain == getDomain(url) || !checkElementSizeThreshold(elementSize)) {
                        // add this element to the map of checked urls
                        checkedElements.set(element, {track : false});
                        return;
                    }
                    checkedElements.set(element, {track: true, url: url, isMatched: isMatched,
                        ignored:false, totalTimeSeen: 0, firstSeen: -1,
                        lastSeenStart: -1, lastThresholdMet: -1,
                    });
                    observer.observe(element);
                    return;
                }
                let status = checkedElements.get(element);
                if (status.ignored || !(status.track)) return;
                // if we have seen and the element is visible for atleast threshold milliseconds
                var totalTimeSeen = status.totalTimeSeen +
                    (status.lastSeenStart == -1 ? 0 :
                        (updateTime - status.lastSeenStart));
                for (var visThreshold of visibilityThresholds) {
                    if (status.lastThresholdMet >= visThreshold) continue;
                    if (totalTimeSeen >= visThreshold) {
                        // send <a> element this to background script
                        if (status.isMatched) {
                            exposureEvents.push({
                                originalUrl: status.url,
                                size: getElementSize(element),
                                firstSeen: status.firstSeen,
                                visThreshold: visThreshold,
                            });
                        } else {
                            numUntrackedUrlsByThreshold[visThreshold] += 1;
                            newUntracked = true;
                        }
                        if (visThreshold == visibilityThresholds[visibilityThresholds.length - 1]) {
                            observer.unobserve(element);
                            status.ignored = true;
                        } else {
                            status.lastThresholdMet = visThreshold;
                        }
                    }
                }
            });
            sendExposureEventsToBackground("WebScience.LinkExposure.linkData", exposureEvents);
        }

        /** callback for IntersectionObserver */
        function handleIntersection(entries, observer) {
            const currentTime = Date.now();
            entries.forEach(entry => {
                const {
                    target
                } = entry;
                let status = checkedElements.get(target);
                if (entry.intersectionRatio >= 0.70 && status.track &&
                    isElementVisible(target) && PageManager.pageHasAttention) {
                    if (status.lastSeenStart == -1) {
                        status.lastSeenStart = currentTime;
                        if (status.firstSeen == -1) status.firstSeen = status.lastSeenStart;
                    }
                } else if (entry.intersectionRatio < 0.70 && status.track) {
                    if (status.lastSeenStart == -1) return; //we already weren't watching
                    status.totalTimeSeen += (currentTime - status.lastSeenStart);
                    status.lastSeenStart = -1;
                }


            });
        }

        // Options for intersection observer
        const options = {
            threshold: [0.70]
        };
        observer = new IntersectionObserver(handleIntersection, options);

        timer = setInterval(() => run(), updateInterval);
        let maxUpdates = -1;
        let numUpdates = 0;

        function run() {
            if (maxUpdates >= 0 && numUpdates >= maxUpdates) {
                clearInterval(timer);
            }
            checkLinksInDom();
            numUpdates++;
        }

        function gainAttention(timeStamp) {
            lastGainedAttention = timeStamp;

            Array.from(document.body.querySelectorAll("a[href]")).forEach(element => {
                if (!checkedElements.has(element)) {
                    return;
                } else {
                    var status = checkedElements.get(element);
                    if (status.ignored || !(status.track)) {
                        return;
                    }
                    if (status.lastSeenStart != -1) {
                        status.totalTimeSeen += lastLostAttention - status.lastSeenStart;
                        status.lastSeenStart = timeStamp;
                    }
                }
            });
        }

        function loseAttention(timeStamp) {
            lastLostAttention = timeStamp;
        }

        PageManager.onPageAttentionUpdate.addListener(({ timeStamp }) => {
            if(PageManager.pageHasAttention)
                gainAttention(timeStamp);
            else
                loseAttention(timeStamp);
        });

        if(PageManager.pageHasAttention)
            gainAttention(Date.now());
    };

    // On page visit stop, clear the timer and intersection observer
    let pageVisitStopListener = function({ timeStamp }) {
        if(timer !== 0)
            clearInterval(timer);
        timer = 0;
        if(observer !== null)
            observer.disconnect();
        observer = null;
    };

    // Wait for PageManager load
    let pageManagerLoaded = function () {
        PageManager.onPageVisitStart.addListener(pageVisitStartListener);
        if(PageManager.pageVisitStarted)
            pageVisitStartListener({timeStamp: PageManager.pageVisitStartTime});

        PageManager.onPageVisitStop.addListener(pageVisitStopListener);
    };
    if ("PageManager" in window)
        pageManagerLoaded();
    else {
        if(!("pageManagerHasLoaded" in window))
            window.pageManagerHasLoaded = [];
        window.pageManagerHasLoaded.push(pageManagerLoaded);
    }

})(); // encapsulate and invoke

