/**
 * Content script for measuring exposure to videos from known channels on youtube
 * @module WebScience.Measurements.SocialMediaAccountExposure
 */
(
    async function () {

        /** time when the document is loaded */
        let initialLoadTime = Date.now();

        let privateWindowResults = await browser.storage.local.get("WebScience.Measurements.SocialMediaAccountExposure.privateWindows");
        if (("WebScience.Measurements.SocialMediaAccountExposure.privateWindows" in privateWindowResults) &&
            !privateWindowResults["WebScience.Measurements.SocialMediaAccountExposure.privateWindows"] &&
            browser.extension.inIncognitoContext) {
            return;
        }

        let channelsRegex = await browser.storage.local.get("knownMediaChannelMatcher");
        const knownMediaChannelMatcher = channelsRegex.knownMediaChannelMatcher;

        /** @constant {number} milliseconds */
        const waitMs = 2000;
        /** listener for new videos loaded; youtube doesn't reload page. It uses history api. */
        document.body.addEventListener("yt-navigate-finish", function (event) {
            setTimeout(checkForVideosFromKnownChannels, waitMs);
        });

        /** sleep and then check for news video */
        setTimeout(checkForVideosFromKnownChannels, waitMs);
        /**
         * @function
         * @name checkForVideosFromKnownChannels function checks if the current webpage has youtube watch/embed url
         * for valid youtube videos, it checks if the video category is News & Politics
         * NOTE : if the inner html doesn't contain News & Politics, then the function
         * clicks on Show More and then checks DOM for video category
         */
        function checkForVideosFromKnownChannels() {
            let domLinkElements = Array.from(document.body.querySelectorAll("a[href]"));
            if (domLinkElements.length > 0) {
                sendMessage([...new Set(domLinkElements.filter(domLinkElement => knownMediaChannelMatcher.test(domLinkElement.href)).map(domLinkElement => {
                    return domLinkElement.href;
                }))]);
            }
        }
        /**
         * 
         * @param {Array} channels - channels exposed
         */
        function sendMessage(channels) {
            browser.runtime.sendMessage({
                type: "WebScience.Measurements.SocialMediaAccountExposure",
                posts: [{
                    post: document.location.href,
                    account: channels[0]
                }],
                loadTime: initialLoadTime,
                platform: "YouTube"
            });
        }
    }
)();
