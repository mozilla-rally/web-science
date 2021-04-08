/**
 * Content script for the linkExposure module.
 * @module webScience.linkExposure.content
 */

import { importMatchPatternSet } from "../matching.js";
import { parseFacebookLinkShim, parseAmpUrl } from "../linkResolution.js";

// async IIFE wrapper to enable await syntax
(async function () {

    let pageManager = null;

    /**
     * How often (in milliseconds) to check the page for new links.
     * @constant {number}
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
     * @constant {boolean}
     */
    const ignoreSelfLinks = true;

    /**
     * The minimum duration (in milliseconds) that a link must be visible to treat it as an exposure.
     * @constant {number}
     */
    const linkVisibilityDuration = 5000;

    /**
     * The minimum width (in pixels from `Element.getBoundingClientRect()`) that a link must have to treat it as an exposure.
     * @constant {number}
     */
    const linkMinimumWidth = 25;

    /**
     * The minimum height (in pixels from `Element.getBoundingClientRect()`) that a link must have to treat it as an exposure.
     * @constant {number}
     */
    const linkMinimumHeight = 15;

    /**
     * The minimum visibility (as a proportion of element size from `IntersectionObserverEntry.intersectionRatio`) that a link must have to treat it as an exposure.
     * @constant {number}
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
        return (new URL(url, pageManager.url)).href;
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
        "webScience.linkExposure.linkMatcher",
    ]);
    const storedUrlShortenerRegExp = await browser.storage.local.get([
        "webScience.linkExposure.urlShortenerRegExp",
    ]);
    const storedAmpRegExp = await browser.storage.local.get([
        "webScience.linkExposure.ampRegExp"
    ]);
    if(!("webScience.linkExposure.linkMatcher" in storedLinkMatcher) ||
        !("webScience.linkExposure.urlShortenerRegExp" in storedUrlShortenerRegExp) ||
        !("webScience.linkExposure.ampRegExp" in storedAmpRegExp)) {
        console.debug("Error: linkExposure content script cannot load RegExps from browser.storage.local.");
        return;
    }
    const linkMatcher = importMatchPatternSet(storedLinkMatcher["webScience.linkExposure.linkMatcher"]);
    const urlShortenerRegExp = storedUrlShortenerRegExp["webScience.linkExposure.urlShortenerRegExp"];

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
        if (!pageManager.pageHasAttention && ((lastLostAttention < 0) || (lastLostAttention + attentionIdlePeriod < timeStamp)))
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
            if(!pageManager.pageHasAttention)
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
                type: "webScience.linkExposure.exposureData",
                pageId: pageManager.pageId,
                pageUrl: pageManager.url,
                pageReferrer: pageManager.referrer,
                pageVisitStartTime: pageManager.pageVisitStartTime,
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
     * @param {IntersectionObserverEntry[]} entries - Updates from the IntersectionObserver that is observing anchor elements.
     */
    function anchorObserverCallback(entries) {
        const timeStamp = Date.now();
        entries.forEach(entry => {
            const anchorElement = entry.target;
            const linkInfo = anchorElements.get(anchorElement)
            if (entry.intersectionRatio >= linkMinimumVisibility) {
                linkInfo.inViewport = true;
                linkInfo.lastEnteredViewport = timeStamp;
                if(pageManager.pageHasAttention)
                    linkInfo.lastEnteredViewportAndPageHadAttention = timeStamp;
            }
            else {
                if(pageManager.pageHasAttention && (linkInfo.lastEnteredViewportAndPageHadAttention > 0))
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
        currentHostname = (new URL(pageManager.url)).hostname;
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
        if(pageManager.pageHasAttention) {
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

    // Wait for pageManager load
    const pageManagerLoaded = function () {
        pageManager = window.webScience.pageManager;
        pageManager.onPageVisitStart.addListener(pageVisitStartListener);
        if(pageManager.pageVisitStarted)
            pageVisitStartListener({timeStamp: pageManager.pageVisitStartTime});

        pageManager.onPageVisitStop.addListener(pageVisitStopListener);

        pageManager.onPageAttentionUpdate.addListener(pageAttentionUpdateListener);
    };
    if (("webScience" in window) && ("pageManager" in window.webScience))
        pageManagerLoaded();
    else {
        if(!("pageManagerHasLoaded" in window))
            window.pageManagerHasLoaded = [];
        window.pageManagerHasLoaded.push(pageManagerLoaded);
    }

})();
