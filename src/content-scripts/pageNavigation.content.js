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
// Tell eslint that pageManager isn't actually undefined
/* global pageManager */

// Function encapsulation to wait for pageManager load
const pageNavigation = function () {
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
     * @constant
     * @type {number}
     */
    const scrollDepthUpdateInterval = 1000;

    /**
     * How often (in milliseconds) after the first time the page gains attention (or after
     * page visit start if `scrollDepthWaitForAttention` is `false`) to begin checking the
     * maximum relative scroll depth. A delay is helpful because some pages have placeholder
     * content while loading (e.g., on YouTube) or lazily load contnt (e.g., on Twitter).
     * @constant
     * @type {number}
     */
    const scrollDepthUpdateDelay = 2000;

    /**
     * The minimum page height required (in pixels, using `document.documentElement.offsetHeight` rather
     * than `scrollHeight` or `clientHeight` to avoid clamping to screen size) to check the maximum
     * relative scroll depth. A minimum height is helpful because some pages have placeholder content
     * while loading (e.g., on YouTube) or lazily load contnt (e.g., on Twitter).
     * @constant
     * @type {number}
     */
    const scrollDepthMinimumHeight = 50;

    /**
     * Whether to wait until the first time the page gains attention before checking the maximum relative
     * scroll depth. Delaying until the first instance of attention is helpful because some pages have
     * placeholder content while loading (e.g., on YouTube) or lazily load contnt (e.g., on Twitter).
     * @constant
     * @type {boolean}
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

    const pageVisitStart = function ({ timeStamp }) {
        // Reset page attention and page audio tracking
        attentionDuration = 0;
        lastAttentionUpdateTime = timeStamp;
        firstAttentionTime = pageManager.pageHasAttention ? timeStamp : 0;
        audioDuration = 0;
        lastAudioUpdateTime = timeStamp;
        attentionAndAudioDuration = 0;

        // Reset scroll depth tracking and set an interval timer for checking scroll depth
        maxRelativeScrollDepth = 0;
        scrollDepthIntervalId = setInterval(function() {
            if((scrollDepthWaitForAttention || ((Date.now() - pageManager.pageVisitStartTime) >= scrollDepthUpdateDelay)) &&
                (!scrollDepthWaitForAttention || ((firstAttentionTime > 0) && ((Date.now() - firstAttentionTime) >= scrollDepthUpdateDelay))) &&
                (document.documentElement.offsetHeight >= scrollDepthMinimumHeight))
                maxRelativeScrollDepth = Math.min(
                    Math.max(maxRelativeScrollDepth, (window.scrollY + document.documentElement.clientHeight) / document.documentElement.scrollHeight),
                    1);
        }, scrollDepthUpdateInterval);
    };
    if(pageManager.pageVisitStarted)
        pageVisitStart({ timeStamp: pageManager.pageVisitStartTime });
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
        // If the page just gained attention for the first time, store the time stamp
        if(pageManager.pageHasAttention && (firstAttentionTime < pageManager.pageVisitStartTime))
            firstAttentionTime = timeStamp;

        // If the page just lost attention, add to the attention duration
        // and possibly the attention and audio duration
        if(!pageManager.pageHasAttention) {
            attentionDuration += timeStamp - lastAttentionUpdateTime;
            if(pageManager.pageHasAudio)
                attentionAndAudioDuration += timeStamp - Math.max(lastAttentionUpdateTime, lastAudioUpdateTime);
        }
        lastAttentionUpdateTime = timeStamp;
    });

    pageManager.onPageAudioUpdate.addListener(({ timeStamp }) => {
        // If the page just lost audio, add to the audio duration
        // and possibly the attention and audio duration
        if(!pageManager.pageHasAudio) {
            audioDuration += timeStamp - lastAudioUpdateTime;
            if(pageManager.pageHasAttention)
                attentionAndAudioDuration += timeStamp - Math.max(lastAttentionUpdateTime, lastAudioUpdateTime);
        }
        lastAudioUpdateTime = timeStamp;
    });
};

// Wait for pageManager load
if ("pageManager" in window)
    pageNavigation();
else {
    if(!("pageManagerHasLoaded" in window))
        window.pageManagerHasLoaded = [];
    window.pageManagerHasLoaded.push(pageNavigation);
}