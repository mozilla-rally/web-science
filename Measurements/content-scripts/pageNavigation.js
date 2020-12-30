/**
 * Content script for the PageNavigation module.
 * 
 * # Known Issues
 *   * When sending page data during a page visit stop event, sometimes
 *     Firefox generates an error ("Promise resolved while context is inactive")
 *     because the content script execution environment is terminating while the
 *     message sending Promise remains open. This error does not affect functionality,
 *     because we do not depend on resolving the Promise (i.e., a response to the
 *     page visit stop message).
 * @module WebScience.Measurements.content-scripts.pageNavigation
 */

// Outer function encapsulation to maintain unique variable scope for each content script
(function () {

    // Inner function encapsulation to wait for PageManager load
    let pageNavigation = function () {
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
         * @constant
         * @type {number}
         * How often (in milliseconds) to check maximum page scroll depth.
         */
        const scrollDepthUpdateInterval = 1000;

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

        let pageVisitStart = function ({ timeStamp }) {
            // Reset page attention and page audio tracking
            attentionDuration = 0;
            lastAttentionUpdateTime = timeStamp;
            audioDuration = 0;
            lastAudioUpdateTime = timeStamp;
            attentionAndAudioDuration = 0;

            // Reset scroll depth tracking and set an interval timer for checking scroll depth
            maxRelativeScrollDepth = 0;
            scrollDepthIntervalId = setInterval(function() {
                maxRelativeScrollDepth = Math.min(
                    Math.max(maxRelativeScrollDepth, (window.scrollY + document.documentElement.clientHeight) / document.documentElement.scrollHeight),
                    1);
            }, scrollDepthUpdateInterval);
        };
        if(PageManager.pageVisitStarted)
            pageVisitStart({ timeStamp: PageManager.pageVisitStartTime });
        PageManager.onPageVisitStart.addListener(pageVisitStart);

        PageManager.onPageVisitStop.addListener(({ timeStamp }) => {
            // Update the attention and audio durations
            if(PageManager.pageHasAttention)
                attentionDuration += timeStamp - lastAttentionUpdateTime;
            if(PageManager.pageHasAudio)
                audioDuration += timeStamp - lastAudioUpdateTime;
            if(PageManager.pageHasAttention && PageManager.pageHasAudio)
                attentionAndAudioDuration += timeStamp - Math.max(lastAttentionUpdateTime, lastAudioUpdateTime);
            
            // Clear the interval timer for checking scroll depth
            clearInterval(scrollDepthIntervalId);

            PageManager.sendMessage({
                type: "WebScience.Measurements.PageNavigation.PageData",
                pageId: PageManager.pageId,
                url: PageManager.url,
                referrer: PageManager.referrer,
                pageVisitStartTime: PageManager.pageVisitStartTime,
                pageVisitStopTime: timeStamp,
                attentionDuration,
                audioDuration,
                attentionAndAudioDuration,
                maxRelativeScrollDepth,
                privateWindow: browser.extension.inIncognitoContext
            });
        });

        PageManager.onPageAttentionUpdate.addListener(({ timeStamp }) => {
            // If the page just lost attention, add to the attention duration
            // and possibly the attention and audio duration
            if(!PageManager.pageHasAttention) {
                attentionDuration += timeStamp - lastAttentionUpdateTime;
                if(PageManager.pageHasAudio)
                    attentionAndAudioDuration += timeStamp - Math.max(lastAttentionUpdateTime, lastAudioUpdateTime);
            }
            lastAttentionUpdateTime = timeStamp;
        });

        PageManager.onPageAudioUpdate.addListener(({ timeStamp }) => {
            // If the page just lost audio, add to the audio duration
            // and possibly the attention and audio duration
            if(!PageManager.pageHasAudio) {
                audioDuration += timeStamp - lastAudioUpdateTime;
                if(PageManager.pageHasAttention)
                    attentionAndAudioDuration += timeStamp - Math.max(lastAttentionUpdateTime, lastAudioUpdateTime);
            }
            lastAudioUpdateTime = timeStamp;
        });
    };

    // Wait for PageManager load
    if ("PageManager" in window)
        pageNavigation();
    else {
        if(!("pageManagerHasLoaded" in window))
            window.pageManagerHasLoaded = [];
        window.pageManagerHasLoaded.push(pageNavigation);
    }

})();
