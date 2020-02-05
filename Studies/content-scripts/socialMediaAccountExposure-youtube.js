/**
 * Content script for measuring exposure to videos from known channels on youtube
 * @module WebScience.Studies.SocialMediaAccountExposure
 */
(
    async function () {

        let privateWindowResults = await browser.storage.local.get("WebScience.Studies.SocialMediaAccountExposure.privateWindows");
        if (("WebScience.Studies.SocialMediaAccountExposure.privateWindows" in privateWindowResults) &&
            !privateWindowResults["WebScience.Studies.SocialMediaAccountExposure.privateWindows"] &&
            browser.extension.inIncognitoContext) {
            return;
        }

        let channelsRegexString = await browser.storage.local.get("mediaYoutubeChannelsRegexString");
        const knownMediaChannelMatcher = new RegExp(channelsRegexString.mediaYoutubeChannelsRegexString);

        // Save the time the page initially completed loading
        let initialLoadTime = Date.now();
        /** @constant {RegExp} regex for youtube video url */
        const ytmatcher = /(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w-_]+)/gmi;
        /** @constant {string} - youtube channel selector */
        const ytchannel = "a[href*=channel]";
        /** @constant {number} milliseconds */
        const waitMs = 2000;
        /** listener for new videos loaded; youtube doesn't reload page. It uses history api. */
        document.body.addEventListener("yt-navigate-finish", function (event) {
            setTimeout(checkChannel, waitMs);
        });

        /** sleep and then check for news video */
        setTimeout(checkChannel, waitMs);
        /**
         * @function
         * @name checkChannel function checks if the current webpage has youtube watch/embed url
         * for valid youtube videos, it checks if the video category is News & Politics
         * NOTE : if the inner html doesn't contain News & Politics, then the function
         * clicks on Show More and then checks DOM for video category
         */
        function checkChannel() {
            let channels = checkForSocialMediaChannels();
            if (channels.length > 0) {
                sendMessage([...new Set(channels.filter(channelElement => knownMediaChannelMatcher.test(channelElement.href)).map(channelElement => {
                    return channelElement.href;
                }))]);
            }
        }
        /**
         * @name checkForSocialMediaChannels
         * @function
         * retrieves <a> elements that includes "channel"
         * @returns {Array} - channels on the page
         */
        function checkForSocialMediaChannels() {
            let matches = document.body.querySelectorAll(ytchannel);
            return Array.from(matches);
        }
        /**
         * 
         * @param {Array} channels - channels exposed
         */
        function sendMessage(channels) {
            browser.runtime.sendMessage({
                type: "WebScience.Studies.SocialMediaAccountExposure",
                posts: [{
                    post: document.location.href,
                    account: channels[0]
                }],
                platform: "YouTube"
            });
        }
    }
)();