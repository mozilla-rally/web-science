/**
 * Content script for the LinkExposure module.
 * @module WebScience.Measurements.content-scripts.linkExposure
 */
// Tell eslint that PageManager isn't actually undefined
/* global PageManager */

// Outer function encapsulation to maintain unique variable scope for each content script
(async function () {

    /**
     * An optimized object for matching against match patterns. A `MatchPatternSet` can provide
     * a significant performance improvement in comparison to `RegExp`s, in some instances
     * greater than 100x. A `MatchPatternSet` can also be exported to an object that uses only
     * built-in types, so it can be persisted or passed to content scripts in extension storage.
     *
     * There are several key optimizations in `MatchPatternSet`:
     *   * URLs are parsed with the `URL` class, which has native implementation.
     *   * Match patterns are indexed by hostname in a hash map. Lookups are much faster than
     *     iteratively advancing and backtracking through a complex regular expression, which
     *     is how domain matching currently occurs with the `Irregexp` regular expression
     *     engine in Firefox and Chrome.
     *   * Match patterns with identical scheme, subdomain matching, and host (i.e., that
     *     differ only in path) are combined.
     *   * The only remaining use of regular expressions is in path matching, where expressions
     *     can be (relatively) uncomplicated.
     *
     * Future performance improvements could include:
     *   * Replacing the path matching implementation to eliminate regular expressions entirely.
     *   * Replacing the match pattern index, such as by implementing a trie.
     */
    class MatchPatternSet {
        /**
         * Creates a match pattern set from an array of match patterns.
         * @param {string[]} matchPatterns - The match patterns for the set.
         */
        constructor(matchPatterns) {
            // Defining the special sets of `<all_url>` and wildcard schemes inside the class so
            // keeping content scripts in sync with this implementation will be easier
            this.allUrls = false;
            this.allUrlsSchemeSet = new Set(["http", "https", "ws", "wss", "ftp", "file", "data"]);
            this.wildcardSchemeSet = new Set(["http", "https", "ws", "wss"]);
            this.patternsByHost = { };
        }

        /**
         * Compares a URL string to the match patterns in the set.
         * @param {string} url - The URL string to compare.
         * @returns {boolean} Whether the URL string matches a pattern in the set.
         */
        matches(url) {
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                // If the target isn't a true URL, it certainly doesn't match
                return false;
            }
            // Remove the trailing : from the parsed protocol
            const scheme = parsedUrl.protocol.substring(0, parsedUrl.protocol.length - 1);
            const host = parsedUrl.hostname;
            const path = parsedUrl.pathname;

            // Check the special `<all_urls>` match pattern
            if(this.allUrls && this.allUrlsSchemeSet.has(scheme))
                return true;

            // Identify candidate match patterns
            let candidatePatterns = [ ];
            // Check each component suffix of the hostname for candidate match patterns
            const hostComponents = parsedUrl.hostname.split(".");
            let hostSuffix = "";
            for(let i = hostComponents.length - 1; i >= 0; i--) {
                hostSuffix = hostComponents[i] + (i < hostComponents.length - 1 ? "." : "") + hostSuffix;
                const hostSuffixPatterns = this.patternsByHost[hostSuffix];
                if(hostSuffixPatterns !== undefined)
                    candidatePatterns = candidatePatterns.concat(hostSuffixPatterns);
            }

            // Add match patterns with a wildcard host to the set of candidates
            const hostWildcardPatterns = this.patternsByHost["*"];
            if(hostWildcardPatterns !== undefined)
                candidatePatterns = candidatePatterns.concat(hostWildcardPatterns);

            // Check the scheme, then the host, then the path for a match
            for(const candidatePattern of candidatePatterns) {
                if((candidatePattern.scheme === scheme) ||
                    ((candidatePattern.scheme === "*") && this.wildcardSchemeSet.has(scheme))) {
                    if(candidatePattern.matchSubdomains ||
                        (candidatePattern.host === "*") ||
                        (candidatePattern.host === host)) {
                        if(candidatePattern.wildcardPath ||
                            candidatePattern.pathRegExp.test(path))
                            return true;
                    }
                }
            }

            return false;
        }

        /**
         * Imports the match pattern set from an opaque object previously generated by `export`.
         * @param {exportedInternals} - The previously exported internals for the match pattern set.
         * @example <caption>Example usage of import.</caption>
         * // const matchPatternSet1 = new MatchPatternSet([ "*://example.com/*" ]);
         * // const exportedInternals = matchPatternSet.export();
         * // const matchPatternSet2 = (new MatchPatternSet([])).import(exportedInternals);
         */
        import(exportedInternals) {
            this.allUrls = exportedInternals.allUrls;
            this.patternsByHost = exportedInternals.patternsByHost;
        }
    }
    /**
     * How often (in milliseconds) to check the page for new links.
     * @constant
     * @type {number}
     */
    const updateInterval = 2000;

    /**
     * How long (in milliseconds) after losing attention to stop checking the links on the page.
     * The content script will resume checking links after regaining attention.
     */
    const attentionIdlePeriod = 5000;

    /**
     * Ignore links where the link hostname is identical to the page hostname.
     * TODO: Implement support for comparing public suffix + 1 domains.
     * @constant
     * @type {boolean}
     */
    const ignoreSelfLinks = true;

    /**
     * The minimum duration (in milliseconds) that a link must be visible to treat it as an exposure.
     * @constant
     * @type {number}
     */
    const linkVisibilityDuration = 5000;

    /**
     * The minimum width (in pixels from `Element.getBoundingClientRect()`) that a link must have to treat it as an exposure.
     * @constant
     * @type {number}
     */
    const linkMinimumWidth = 25;

    /**
     * The minimum height (in pixels from `Element.getBoundingClientRect()`) that a link must have to treat it as an exposure.
     * @constant
     * @type {number}
     */
    const linkMinimumHeight = 15;

    /**
     * The minimum visibility (as a proportion of element size from `IntersectionObserverEntry.intersectionRatio`) that a link must have to treat it as an exposure.
     * @constant
     * @type {number}
     */
    const linkMinimumVisibility = 0.7;

    /**
     * Check if an Element is visible. Visibility is defined as a `display` computed style other than `none` and an `opacity` computed style other than 0.
     * @param {Element} element - The element to check.
     * @returns {boolean} Whether the element is visible, or `false` if the parameter `element` is not an `Element`.
     */
    function isElementVisible(element) {
        if(!(element instanceof Element))
            return false;
        const style = window.getComputedStyle(element);
        const display = style.getPropertyValue("display");
        if((display === "") || (display === "none"))
            return false;
        const opacity = style.getPropertyValue("opacity");
        if((opacity === "") || (opacity === "0"))
            return false;
        return true;
    }

    /**
     * Converts a link URL, which may be relative, to an absolute URL.
     * @param {string} url - The input URL, which may be relative.
     * @returns {string} If the `url` is relative, an absolute version of `url`. Otherwise just `url`.
     */
    function linkUrlToAbsoluteUrl(url) {
        // Note that if the url is already absolute, the URL constructor will ignore the specified base URL
        return (new URL(url, PageManager.url)).href;
    }

    /**
     * The ID for a timer to periodically check links.
     * @type {number}
     */
    let timerId = 0;

    // Complete loading RegExps from storage before setting up event handlers
    // to avoid possible race conditions
    // Haunted. Don't combine into one call.
    const storedLinkMatcher = await browser.storage.local.get([
        "WebScience.Measurements.LinkExposure.linkMatcher",
    ]);
    const storedUrlShortenerRegExp = await browser.storage.local.get([
        "WebScience.Measurements.LinkExposure.urlShortenerRegExp",
    ]);
    const storedAmpRegExp = await browser.storage.local.get([
        "WebScience.Measurements.LinkExposure.ampRegExp"
    ]);
    if(!("WebScience.Measurements.LinkExposure.linkMatcher" in storedLinkMatcher) ||
        !("WebScience.Measurements.LinkExposure.urlShortenerRegExp" in storedUrlShortenerRegExp) ||
        !("WebScience.Measurements.LinkExposure.ampRegExp" in storedAmpRegExp)) {
        console.debug("Error: LinkExposure content script cannot load RegExps from browser.storage.local.");
        return;
    }
    const linkMatcher = new MatchPatternSet([]);
    linkMatcher.import(storedLinkMatcher["WebScience.Measurements.LinkExposure.linkMatcher"]);
    console.log(linkMatcher);
    console.log(linkMatcher.matches);
    console.log(linkMatcher.matches("https://nytimes.com/"));
    const urlShortenerRegExp = storedUrlShortenerRegExp["WebScience.Measurements.LinkExposure.urlShortenerRegExp"];
    const ampRegExp = storedAmpRegExp["WebScience.Measurements.LinkExposure.ampRegExp"];

    /**
     * A RegExp for matching URLs that have had Facebook's link shim applied.
     * @constant
     * @type {RegExp}
     */
    const facebookLinkShimRegExp = /^https?:\/\/l.facebook.com\/l\.php\?u=/;

    /**
     * Parse a URL from Facebook's link shim, if the shim was applied to the URL.
     * @param {string} url - A URL that may have Facebook's link shim applied.
     * @returns {string} If Facebook's link shim was applied to the URL, the unshimmed URL. Otherwise, just the URL.
     */
    function parseFacebookLinkShim(url) {
        if(!facebookLinkShimRegExp.test(url))
            return url;

        // Extract the original URL from the "u" parameter
        const urlObject = new URL(url);
        const uParamValue = urlObject.searchParams.get('u');
        if(uParamValue === null)
            return url;
        return uParamValue;
    }

    /**
     * Parse the underlying URL from an AMP cache or viewer URL, if the URL is an AMP cache or viewer URL.
     * @param {string} url - A URL that may be an AMP cache or viewer URL.
     * @returns {string} If the URL is an AMP cache or viewer URL, the parsed underlying URL. Otherwise, just the URL.
     */
    function parseAmpUrl(url) {
        if(!ampRegExp.test(url))
            return url;
        const parsedAmpUrl = ampRegExp.exec(url);
        // Reconstruct AMP cache URLs
        if(parsedAmpUrl.groups.ampCacheUrl !== undefined)
            return "http" +
                ((parsedAmpUrl.groups.ampCacheIsSecure === "s") ? "s" : "") +
                "://" +
                parsedAmpUrl.groups.ampCacheUrl;
        // Reconstruct AMP viewer URLs, assuming the protocol is HTTPS
        return "https://" + parsedAmpUrl.groups.ampViewerUrl;
    }

    /**
     * The time when the page last lost the user's attention, or -1 if the page has never had the user's attention.
     * @type {number}
     */
    let lastLostAttention = -1;

    /**
     * The hostname for the current page.
     * @type {string}
     */
    let currentHostname = "";

    /**
     * Additional information about an anchor element.
     * @typedef {Object} LinkInfo
     * @property {boolean} observing - Whether this is a link that we are currently observing.
     * @property {string} url - The URL for this link, with any Facebook link shim or AMP cache formatting reversed.
     * @property {boolean} isMatched - Whether the link matches the match pattern for measurement or is a shortened URL.
     * @property {number} totalTimeSeen - How long (in milliseconds) that the link has been in view.
     * @property {number} lastEnteredViewport - When the link last entered the browser viewport.
     * @property {boolean} inViewport - Whether the link is in the browser viewport.
     * @property {number} lastEnteredViewportAndPageHadAttention - When the link last entered the viewport and the page had attention.
     */

    /**
     * A WeakMap where keys are anchor elements that we have checked and values are additional information about those elements.
     * @type {WeakMap<HTMLAnchorElement, LinkInfo>}
     */
    let anchorElements = new WeakMap();

    // Tracked link exposure events to include in the update to the background script
    let exposureEvents = [];

    // Untracked exposure events to include in the update to the background script
    let numUntrackedUrls = 0;

    /**
     * Update the total time that a link has been seen by the user, assuming
     * the page has attention and the link is in the viewport. If the link has
     * been viewed for longer than the threshold, queue it for reporting to the
     * background script and stop observing it.
     *
     * @param {number} timeStamp - The time when the underlying event fired.
     * @param {HTMLAnchorElement} anchorElement - The anchor element.
     * @param {LinkInfo} linkInfo - Information about the link.
     */
    function updateLinkTimeSeen(timeStamp, anchorElement, linkInfo) {
        // If the link is styled as visible, accumulate the visible time for the link
        // Note that we're assuming the link style was constant throughout the timespan
        if(isElementVisible(anchorElement))
            linkInfo.totalTimeSeen += timeStamp - linkInfo.lastEnteredViewportAndPageHadAttention;

        // Move up when the link most recently was in the viewport and the page had attention,
        // since we've just accumulated a span of time
        linkInfo.lastEnteredViewportAndPageHadAttention = timeStamp;

        // If the user has seen the link longer than the visibility threshold, include it in the update
        // to the background script
        if(linkInfo.totalTimeSeen >= linkVisibilityDuration) {
            if(linkInfo.isMatched) {
                const elementRect = anchorElement.getBoundingClientRect();
                exposureEvents.push({
                    originalUrl: linkInfo.url,
                    firstSeen: linkInfo.firstSeen,
                    width: elementRect.width,
                    height: elementRect.height,
                    isShortenedUrl: linkInfo.isShortenedUrl
                });
            }
            else
                numUntrackedUrls++;

            anchorElements.set(anchorElement, {observing: false});
            observer.unobserve(anchorElement);
        }
    }

    /**
     * A timer callback function that checks links (anchor elements) in the DOM.
     */
    function checkLinksInDom() {
        const timeStamp = Date.now();

        // If the page does not have attention and we're confident that the page did not recently have attention, ignore this timer tick
        if (!PageManager.pageHasAttention && ((lastLostAttention < 0) || (lastLostAttention + attentionIdlePeriod < timeStamp)))
            return;

        // Iterate all the links currently on the page (i.e., anchor elements with an href attribute)
        document.body.querySelectorAll("a[href]").forEach(element => {
            const linkInfo = anchorElements.get(element)

            // If we haven't seen this link before, check the URL and dimensions
            // If the URL is a match (or possible match) and the dimensions aren't too small, start
            // observing the link
            if (linkInfo === undefined) {
                let url = linkUrlToAbsoluteUrl(element.href);
                url = parseFacebookLinkShim(url);
                url = parseAmpUrl(url);

                // Check if the link hostname matches the page hostname,
                // ignore if configured to ignore these self-links
                if(ignoreSelfLinks && ((new URL(url)).hostname === currentHostname)) {
                    anchorElements.set(element, {observing: false});
                    return;
                }

                // Check if the link is too small, ignore it if it is
                const elementRect = element.getBoundingClientRect();
                if ((elementRect.width < linkMinimumWidth) ||
                    (elementRect.height < linkMinimumHeight)) {
                    anchorElements.set(element, {observing: false});
                    return;
                }

                // Flag a link as matched if either it matches the link match patterns or it is a shortened URL
                // Start observing the link with the IntersectionObserver
                let isMatched = linkMatcher.matches(url);

                const isShortenedUrl = urlShortenerRegExp.test(url);
                isMatched = isMatched || isShortenedUrl;

                anchorElements.set(element, {
                    observing: true,
                    url,
                    isMatched,
                    isShortenedUrl,
                    totalTimeSeen: 0,
                    firstSeen: timeStamp,
                    lastEnteredViewport: -1,
                    inViewport: false,
                    lastEnteredViewportAndPageHadAttention: -1
                });
                observer.observe(element);
                return;
            }

            // If the page does not have attention, move to the next link
            if(!PageManager.pageHasAttention)
                return;

            // If we have seen this link before and are not observing it, move on to the next link
            if (!linkInfo.observing)
                return;

            // If the link is not in the browserviewport, move to the next link
            if(!linkInfo.inViewport)
                return;

            updateLinkTimeSeen(timeStamp, element, linkInfo);
        });
        if ((exposureEvents.length > 0) || (numUntrackedUrls > 0)) {
            browser.runtime.sendMessage({
                type: "WebScience.Measurements.LinkExposure.exposureData",
                pageId: PageManager.pageId,
                pageUrl: PageManager.url,
                pageReferrer: PageManager.referrer,
                pageVisitStartTime: PageManager.pageVisitStartTime,
                privateWindow: browser.extension.inIncognitoContext,
                linkExposures: exposureEvents,
                nonmatchingLinkExposures: numUntrackedUrls
            });
            exposureEvents = [];
            numUntrackedUrls = 0;
        }
    }

    /**
     * An IntersectionObserver callback for anchor elements.
     * @param {Array<IntersectionObserverEntry>} entries - Updates from the IntersectionObserver that is observing anchor elements.
     */
    function anchorObserverCallback(entries) {
        const timeStamp = Date.now();
        entries.forEach(entry => {
            const anchorElement = entry.target;
            const linkInfo = anchorElements.get(anchorElement)
            if (entry.intersectionRatio >= linkMinimumVisibility) {
                linkInfo.inViewport = true;
                linkInfo.lastEnteredViewport = timeStamp;
                if(PageManager.pageHasAttention)
                    linkInfo.lastEnteredViewportAndPageHadAttention = timeStamp;
            }
            else {
                if(PageManager.pageHasAttention && (linkInfo.lastEnteredViewportAndPageHadAttention > 0))
                    updateLinkTimeSeen(timeStamp, anchorElement, linkInfo);
                linkInfo.inViewport = false;
            }
        });
    }

    /**
     * An IntersectionObserver for checking link visibility.
     * @type {IntersectionObserver}
     */
    const observer = new IntersectionObserver(anchorObserverCallback, { threshold: linkMinimumVisibility });

    const pageVisitStartListener = function ({ timeStamp }) {
        // Reset page-specific data
        lastLostAttention = -1;
        currentHostname = (new URL(PageManager.url)).hostname;
        anchorElements = new WeakMap();

        // Start the timer ticking
        timerId = setInterval(checkLinksInDom, updateInterval);
    };

    // On page visit stop, clear the timer and intersection observer
    const pageVisitStopListener = function() {
        if(timerId !== 0)
            clearInterval(timerId);
        timerId = 0;
        observer.disconnect();
    };

    const pageAttentionUpdateListener = function({ timeStamp }) {
        const currentAnchorElements = document.body.querySelectorAll("a[href]");
        if(PageManager.pageHasAttention) {
            for(const anchorElement of currentAnchorElements) {
                const linkInfo = anchorElements.get(anchorElement);
                if(linkInfo !== undefined)
                    linkInfo.lastEnteredViewportAndPageHadAttention = timeStamp;
            }
        }
        else {
            lastLostAttention = timeStamp;
            for(const anchorElement of currentAnchorElements) {
                const linkInfo = anchorElements.get(anchorElement);
                if((linkInfo !== undefined) && (linkInfo.lastEnteredViewportAndPageHadAttention > 0))
                    updateLinkTimeSeen(timeStamp, anchorElement, linkInfo);
            }
        }
    }

    // Wait for PageManager load
    const pageManagerLoaded = function () {
        PageManager.onPageVisitStart.addListener(pageVisitStartListener);
        if(PageManager.pageVisitStarted)
            pageVisitStartListener({timeStamp: PageManager.pageVisitStartTime});

        PageManager.onPageVisitStop.addListener(pageVisitStopListener);

        PageManager.onPageAttentionUpdate.addListener(pageAttentionUpdateListener);
    };
    if ("PageManager" in window)
        pageManagerLoaded();
    else {
        if(!("pageManagerHasLoaded" in window))
            window.pageManagerHasLoaded = [];
        window.pageManagerHasLoaded.push(pageManagerLoaded);
    }

})();
