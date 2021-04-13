/**
 * Content script for the pageNavigation module.
 *
 * # Known Issues
 *   * When sending page data during a page visit stop event, sometimes
 *     Firefox generates an error ("Promise resolved while context is inactive")
 *     because the content script execution environment is terminating while the
 *     message sending Promise remains open. This error does not affect functionality,
 *     because we do not depend on resolving the Promise (i.e., a response to the
 *     page visit stop message).
 * @module webScience.pageNavigation.content
 */

// Function encapsulation to wait for pageManager load
const pageNavigation = function () {

    // If the pageNavigation content script is already running on this page, no need for this instance
    if("webScience" in window) {
        if("pageNavigationActive" in window.webScience) {
            return;
        }
        window.webScience.pageNavigationActive = true;
    }
    else {
        window.webScience = {
            pageNavigationActive: true
        }
    }

    const pageManager = window.webScience.pageManager;

    /**
     * How long the page has had the user's attention.
     * @type {number}
     */
    let attentionDuration = 0;

    /**
     * When the page attention state was last updated.
     * @type {number}
     */
    let lastAttentionUpdateTime = 0;

    /**
     * How long the page has played audio.
     * @type {number}
     */
    let audioDuration = 0;

    /**
     * When the page last began playing audio.
     * @type {number}
     */
    let lastAudioUpdateTime = 0;

    /**
     * How long the page has simultaneously had attention and played audio. This value is
     * a useful approximation of video viewing time.
     * @type {number}
     */
    let attentionAndAudioDuration = 0;

    /**
     * How often (in milliseconds) to check maximum page scroll depth.
     * @constant {number}
     */
    const scrollDepthUpdateInterval = 1000;

    /**
     * How often (in milliseconds) after the first time the page gains attention (or after
     * page visit start if `scrollDepthWaitForAttention` is `false`) to begin checking the
     * maximum relative scroll depth. A delay is helpful because some pages have placeholder
     * content while loading (e.g., on YouTube) or lazily load contnt (e.g., on Twitter).
     * @constant {number}
     */
    const scrollDepthUpdateDelay = 2000;

    /**
     * The minimum page height required (in pixels, using the maximum of `document.documentElement.offsetHeight`
     * and `window.scrollY`) to check the maximum relative scroll depth. A minimum height is helpful because some
     * pages have placeholder content while loading (e.g., on YouTube) or lazily load content (e.g., on Twitter).
     * We use `document.documentElement.offsetHeight` because it typically measures the vertical height of document
     * content, and we use `window.scrollY` as a backstop of real user scrolling because in unusual layouts (e.g.,
     * YouTube) the value of `document.documentElement.offsetHeight` is 0. We do not use `scrollHeight` or
     * `clientHeight` because those values are clamped to screen size.
     * @constant {number}
     */
    const scrollDepthMinimumHeight = 50;

    /**
     * Whether to wait until the first time the page gains attention before checking the maximum relative
     * scroll depth. Delaying until the first instance of attention is helpful because some pages have
     * placeholder content while loading (e.g., on YouTube) or lazily load contnt (e.g., on Twitter).
     * @constant {boolean}
     */
    const scrollDepthWaitForAttention = true;

    /**
     * The first time the page had attention, or 0 if the page has never had attention.
     * @type {number}
     */
    let firstAttentionTime = 0;

    /**
     * The maximum relative scroll depth, defined as the depth of the bottom of
     * the content window divided by the depth of the page:
     * (`window.scrollY` + `document.documentElement.clientHeight`) / `document.documentElement.scrollHeight`.
     * Note that `document.documentElement.clientHeight` and `document.documentElement.scrollHeight`
     * include padding but not margin or border.
     * @type {number}
     */
    let maxRelativeScrollDepth = 0;

    /**
     * An interval timer ID for checking scroll depth.
     * @type {number}
     */
    let scrollDepthIntervalId = 0;

    /**
     * A timer tick callback function that updates the maximum relative scroll depth on the page.
     */
    function updateMaxRelativeScrollDepth() {
        /* Don't measure scroll depth if:
         *   * The page doesn't have the user's attention
         *   * Scroll depth measurement doesn't wait on attention and the page load is too recent
         *   * Scroll depth measurement does wait on attention and either the first attention hasn't happened or is too recent
         *   * The content height and user scrolling are below a minimum amount
         */
        if(!pageManager.pageHasAttention ||
            (!scrollDepthWaitForAttention && (Date.now() - pageManager.pageVisitStartTime) < scrollDepthUpdateDelay) || 
            (scrollDepthWaitForAttention && ((firstAttentionTime <= 0) || ((Date.now() - firstAttentionTime) < scrollDepthUpdateDelay))) ||
            (Math.max(document.documentElement.offsetHeight, window.scrollY) < scrollDepthMinimumHeight)) {
            return;
        }
        // Set the maximum relative scroll depth
        maxRelativeScrollDepth = Math.min(
            Math.max(maxRelativeScrollDepth, (window.scrollY + document.documentElement.clientHeight) / document.documentElement.scrollHeight),
            1);
    }

    /**
     * A callback function for pageManager.onPageVisitStart.
     * @param {Object} details
     * @param {number} details.timeStamp 
     */
    function pageVisitStart ({ timeStamp }) {
        // Reset page attention and page audio tracking
        attentionDuration = 0;
        lastAttentionUpdateTime = timeStamp;
        firstAttentionTime = pageManager.pageHasAttention ? timeStamp : 0;
        audioDuration = 0;
        lastAudioUpdateTime = timeStamp;
        attentionAndAudioDuration = 0;
        scrollDepthIntervalId = 0;

        // Reset scroll depth tracking and, if the page has attention, set an interval timer for checking scroll depth
        maxRelativeScrollDepth = 0;
        if(pageManager.pageHasAttention) {
            scrollDepthIntervalId = setInterval(updateMaxRelativeScrollDepth, scrollDepthUpdateInterval);
        }
    }
    if(pageManager.pageVisitStarted) {
        pageVisitStart({ timeStamp: pageManager.pageVisitStartTime });
    }
    pageManager.onPageVisitStart.addListener(pageVisitStart);

    pageManager.onPageVisitStop.addListener(({ timeStamp }) => {
        // Update the attention and audio durations
        if(pageManager.pageHasAttention)
            attentionDuration += timeStamp - lastAttentionUpdateTime;
        if(pageManager.pageHasAudio)
            audioDuration += timeStamp - lastAudioUpdateTime;
        if(pageManager.pageHasAttention && pageManager.pageHasAudio)
            attentionAndAudioDuration += timeStamp - Math.max(lastAttentionUpdateTime, lastAudioUpdateTime);

        // Clear the interval timer for checking scroll depth
        clearInterval(scrollDepthIntervalId);

        // Send page engagement data to the background script
        pageManager.sendMessage({
            type: "webScience.pageNavigation.pageData",
            pageId: pageManager.pageId,
            url: pageManager.url,
            referrer: pageManager.referrer,
            pageVisitStartTime: pageManager.pageVisitStartTime,
            pageVisitStopTime: timeStamp,
            attentionDuration,
            audioDuration,
            attentionAndAudioDuration,
            maxRelativeScrollDepth,
            privateWindow: browser.extension.inIncognitoContext
        });
    });

    pageManager.onPageAttentionUpdate.addListener(({ timeStamp }) => {
        // If the page just gained attention, start the timer, and if this
        // was the first user attention store the timestamp
        if(pageManager.pageHasAttention) {
            if(scrollDepthIntervalId <= 0) {
                scrollDepthIntervalId = setInterval(updateMaxRelativeScrollDepth, scrollDepthUpdateInterval);
            }
            if(firstAttentionTime < pageManager.pageVisitStartTime) {
                firstAttentionTime = timeStamp;
            }
        }

        // If the page just lost attention, add to the attention duration
        // and possibly the attention and audio duration, and stop the timer
        if(!pageManager.pageHasAttention) {
            attentionDuration += timeStamp - lastAttentionUpdateTime;
            if(pageManager.pageHasAudio) {
                attentionAndAudioDuration += timeStamp - Math.max(lastAttentionUpdateTime, lastAudioUpdateTime);
            }
            clearInterval(scrollDepthIntervalId);
            scrollDepthIntervalId = 0;
        }
        lastAttentionUpdateTime = timeStamp;
    });

    pageManager.onPageAudioUpdate.addListener(({ timeStamp }) => {
        // If the page just lost audio, add to the audio duration
        // and possibly the attention and audio duration
        if(!pageManager.pageHasAudio) {
            audioDuration += timeStamp - lastAudioUpdateTime;
            if(pageManager.pageHasAttention) {
                attentionAndAudioDuration += timeStamp - Math.max(lastAttentionUpdateTime, lastAudioUpdateTime);
            }
        }
        lastAudioUpdateTime = timeStamp;
    });
};

// Wait for pageManager load
if (("webScience" in window) && ("pageManager" in window.webScience)) {
    pageNavigation();
}
else {
    if(!("pageManagerHasLoaded" in window)) {
        window.pageManagerHasLoaded = [];
    }
    window.pageManagerHasLoaded.push(pageNavigation);
}
