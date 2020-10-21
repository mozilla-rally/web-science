/**
 * Content script for the PageDepth module
 * @module WebScience.Measurements.content-scripts.pageDepth
 */

// Function encapsulation to maintain unique variable scope for each content script
(
    async function () {

        /**
         * @constant
         * How often (in milliseconds) to check maximum page scroll depth
         */
        const updateInterval = 1000;

        /**
         * The maximum relative scroll depth, defined as the depth of the bottom of
         * the content window divided by the depth of the page:
         * (`window.scrollY` + `document.documentElement.clientHeight`) / `document.documentElement.scrollHeight`.
         * Note that `document.documentElement.clientHeight` and `document.documentElement.scrollHeight`
         * include padding but not margin or border.
         */
        var maxRelativeScrollDepth = 0;

        // Set an interval to check the scroll depth
        var intervalId = setInterval(function() {
            maxRelativeScrollDepth = Math.min(
                Math.max(maxRelativeScrollDepth, (window.scrollY + document.documentElement.clientHeight) / document.documentElement.scrollHeight),
                1);
        }, updateInterval);

        // Set a window beforeunload handler to report the maximum scroll depth
        // Using beforeunload rather than unload because unload seems to not
        // populate the tab object when the background page receives the message
        window.addEventListener("beforeunload", function() {
            clearInterval(intervalId);
            browser.runtime.sendMessage({
                type: "WebScience.pageDepth",
                maxRelativeScrollDepth,
                loadTime: performance.timeOrigin
            });
        });

    }
)();


