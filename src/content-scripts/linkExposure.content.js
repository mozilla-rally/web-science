/**
 * Content script for the linkExposure module.
 * @module linkExposure.content
 */

import { urlToPS1 } from "../linkResolution.js";
import * as timing from "../timing.js";
import { urlShortenerWithContentMatchPatterns } from "../data/urlShortenersWithContent.js";
import { createMatchPatternSet } from "../matching.js";

// async IIFE wrapper to enable await syntax and early returns
(async function () {

    // If the linkExposure content script is already running on this page, no need for this instance
    if("webScience" in window) {
        if("linkExposureActive" in window.webScience) {
            return;
        }
        window.webScience.linkExposureActive = true;
    }
    else {
        window.webScience = {
            linkExposureActive: true
        }
    }

    let pageManager = null;

    /**
     * How often (in milliseconds) to check the page for new links.
     * @constant {number}
     */
    const updateInterval = 3000;

    /**
     * How long (in milliseconds) after losing attention to stop checking the links on the page.
     * The content script will resume checking links after regaining attention.
     * @constant {number}
     */
    const attentionIdlePeriod = 5000;

    /**
     * Ignore links where the link URL PS+1 is identical to the page URL PS+1.
     * Note that there is another ignoreSelfLinks constant in the linkExposure
     * background script, and these two constants should have the same value.
     * @constant {boolean}
     */
    const ignoreSelfLinks = true;

    /**
     * A match pattern set of URL shorteners with content. We except these URL
     * shorteners from immediately being considered self-links, since they
     * might resolve to a URL that isn't a self-link.
     */
    const urlShortenerWithContentMatchPatternSet = createMatchPatternSet(urlShortenerWithContentMatchPatterns);

    /**
     * The minimum duration (in milliseconds) that a link must be visible to treat it as an exposure.
     * @constant {number}
     */
    const linkVisibilityDuration = 3000;

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

    /**
     * The time when the page last lost the user's attention, or -1 if the page has never had the user's attention.
     * @type {number}
     */
    let lastLostAttention = -1;

    /**
     * Additional information about an anchor element.
     * @typedef {Object} LinkInfo
     * @property {boolean} observing - Whether this is a link that we are currently observing.
     * @property {string} [url] - The URL for the link.
     * @property {number} [totalTimeExposed] - How long (in milliseconds) that the link has been in view.
     * @property {boolean} [inViewport] - Whether the link is in the browser viewport.
     * @property {number} [lastExposureStartTime] - When the last exposure to the link began.
     */

    /**
     * A WeakMap where keys are anchor elements that we have checked and values are additional information about those elements.
     * @type {WeakMap<HTMLAnchorElement, LinkInfo>}
     */
    let anchorElements = new WeakMap();

    // The URLs of exposed links to include in the update to the background script
    let exposedLinkURLs = [];

    /**
     * The public suffix + 1 for the page URL.
     * @type {string}
     */
    let pagePS1 = "";

    /**
     * Update the time that the user has been exposed to a link. If the link
     * exposure is longer than the threshold, queue the link for reporting to the
     * background script and stop observing it.
     * @param {number} timeStamp - The time when the underlying event fired.
     * @param {HTMLAnchorElement} anchorElement - The anchor element.
     * @param {LinkInfo} linkInfo - Information about the link.
     */
    function updateLinkExposure(timeStamp, anchorElement, linkInfo) {
        // If we aren't observing the link, there's nothing to update
        if(!linkInfo.observing) {
            return;
        }
        // If the user is currently exposed to the link (i.e., the page has attention, the link is
        // in the viewport, and the link is visible), accumulate how long the link exposure lasted
        // and move up the link exposure start time
        if(pageManager.pageHasAttention && linkInfo.inViewport && isElementVisible(anchorElement)) {
            if(linkInfo.lastExposureStartTime > 0) {
                linkInfo.totalTimeExposed += timeStamp - linkInfo.lastExposureStartTime;
            }
            linkInfo.lastExposureStartTime = timeStamp;
        }
        // If the user is not exposed to the link, drop the link exposure start time
        else {
            linkInfo.lastExposureStartTime = -1;
        }

        // If the user has been exposed to the link longer than the visibility threshold, queue the
        // link URL for sending to the background script and stop observing the link
        if(linkInfo.totalTimeExposed >= linkVisibilityDuration) {
            exposedLinkURLs.push(linkInfo.url);
            anchorElements.set(anchorElement, { observing: false });
            observer.unobserve(anchorElement);
        }
    }

    /**
     * Iterates the anchor elements in the DOM, calling the callback function with
     * each anchor element.
     * @param {Function} callback
     */
    function forEachAnchorElement(callback) {
        document.body.querySelectorAll("a[href]").forEach(anchorElement => {
            callback(anchorElement);
        });
    }

    /**
     * A timer callback function that checks links (anchor elements) in the DOM.
     */
    function timerTick() {
        const timeStamp = timing.now();

        // Iterate all the links currently on the page (i.e., anchor elements with an href attribute)
        forEachAnchorElement(anchorElement => {
            const linkInfo = anchorElements.get(anchorElement)

            // If we haven't seen this link before, check the URL
            if (linkInfo === undefined) {
                const url = linkUrlToAbsoluteUrl(anchorElement.href);

                // Check if the link URL PS+1 matches the page PS+1.
                // If there's a match and we're ignoring self links,
                // don't observe the link.
                // We exempt URL shorteners with content from this
                // check, since the resolved URL might not be a self-link.
                if(ignoreSelfLinks &&
                    (urlToPS1(url) === pagePS1) &&
                    !urlShortenerWithContentMatchPatternSet.matches(url)) {
                    anchorElements.set(anchorElement, { observing: false });
                    return;
                }

                // Check if the link is too small, and if it is,
                // don't observe the link
                // Note: we only measure element size once because
                // getBoundingClientRect is expensive and links rarely
                // change size
                const elementRect = anchorElement.getBoundingClientRect();
                if ((elementRect.width < linkMinimumWidth) ||
                    (elementRect.height < linkMinimumHeight)) {
                    anchorElements.set(anchorElement, { observing: false });
                    return;
                }

                // Start observing the link
                anchorElements.set(anchorElement, {
                    observing: true,
                    url,
                    totalTimeExposed: 0,
                    inViewport: false,
                    lastExposureStartTime: -1
                });
                observer.observe(anchorElement);
                return;
            }

            // If we have seen this link before, update the user's exposure to the link
            updateLinkExposure(timeStamp, anchorElement, linkInfo);
        });
        
        notifyBackgroundScript();

        // If the page does not have attention and we're confident that the page did not recently have attention, stop ticking the timer
        if (!pageManager.pageHasAttention && ((lastLostAttention < 0) || (lastLostAttention + attentionIdlePeriod < timeStamp))) {
            clearInterval(timerId);
            timerId = 0;
            return;
        }
    }

    /**
     * Notify the background script of any exposed links.
     */
    function notifyBackgroundScript() {
        if (exposedLinkURLs.length > 0) {
            browser.runtime.sendMessage({
                type: "webScience.linkExposure.linkExposureUpdate",
                pageId: pageManager.pageId,
                url: pageManager.url,
                privateWindow: browser.extension.inIncognitoContext,
                linkUrls: exposedLinkURLs
            });
            exposedLinkURLs = [];
        }
    }

    /**
     * An IntersectionObserver callback for anchor elements.
     * @param {IntersectionObserverEntry[]} entries - Updates from the IntersectionObserver that is observing anchor elements.
     */
    function anchorObserverCallback(entries) {
        const timeStamp = timing.now();
        entries.forEach(entry => {
            const anchorElement = entry.target;
            const linkInfo = anchorElements.get(anchorElement);

            // Update whether the link is in the viewport, applying the minimum visibility threshold
            linkInfo.inViewport = entry.intersectionRatio >= linkMinimumVisibility;

            // Update the user's exposure to the link
            updateLinkExposure(timeStamp, anchorElement, linkInfo);
        });
    }

    /**
     * An IntersectionObserver for checking link visibility.
     * @constant {IntersectionObserver}
     */
    const observer = new IntersectionObserver(anchorObserverCallback, { threshold: linkMinimumVisibility });

    /**
     * A listener for pageManager.onPageVisitStart. Resets page-specific data and starts the
     * timer ticking.
     */
    function pageVisitStartListener () {
        // Reset page-specific data
        lastLostAttention = -1;
        anchorElements = new WeakMap();
        pagePS1 = urlToPS1(pageManager.url);

        exposedLinkURLs = [];

        // Start the timer ticking
        timerId = setInterval(timerTick, updateInterval);
    }

    /**
     * A listener for pageManager.onPageVisitStop. Clears the timer and intersection observer.
     */
    function pageVisitStopListener() {
        // There might be links queued for reporting, so report them
        notifyBackgroundScript();
        clearInterval(timerId);
        timerId = 0;
        observer.disconnect();
    }

    /**
     * A listener for pageManager.onPageAttentionUpdate.
     * @param {Options} details
     * @param {number} details.timeStamp
     */
    function pageAttentionUpdateListener({ timeStamp }) {
        // If the page has gained attention, and the timer isn't ticking, start ticking
        if(pageManager.pageHasAttention && (timerId <= 0)) {
            timerId = setInterval(timerTick, updateInterval);
        }
        // If the page has lost attention, save the timestamp
        if(!pageManager.pageHasAttention) {
            lastLostAttention = timeStamp;
        }

        // Iterate all the links currently on the page and update link exposure
        forEachAnchorElement(anchorElement => {
            const linkInfo = anchorElements.get(anchorElement);
            if(linkInfo === undefined) {
                return;
            }
            updateLinkExposure(timeStamp, anchorElement, linkInfo);
        });
    }

    // Wait for pageManager load
    function pageManagerLoaded() {
        pageManager = window.webScience.pageManager;
        pageManager.onPageVisitStart.addListener(pageVisitStartListener);
        if(pageManager.pageVisitStarted) {
            pageVisitStartListener();
        }
        pageManager.onPageVisitStop.addListener(pageVisitStopListener);
        pageManager.onPageAttentionUpdate.addListener(pageAttentionUpdateListener);
    }
    if (("webScience" in window) && ("pageManager" in window.webScience))
        pageManagerLoaded();
    else {
        if(!("pageManagerHasLoaded" in window))
            window.pageManagerHasLoaded = [];
        window.pageManagerHasLoaded.push(pageManagerLoaded);
    }

})();
