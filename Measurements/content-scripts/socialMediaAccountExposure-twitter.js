/**
 * Content script for measuring exposure to content from known twitter handles
 * @module WebScience.Measurements.SocialMediaAccountExposure
 */
(
    async function () {


        /** time when the document is loaded */
        let initialLoadTime = Date.now();
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

        let privateWindowResults = await browser.storage.local.get("WebScience.Measurements.SocialMediaAccountExposure.privateWindows");
        if (("WebScience.Measurements.SocialMediaAccountExposure.privateWindows" in privateWindowResults) &&
            !privateWindowResults["WebScience.Measurements.SocialMediaAccountExposure.privateWindows"] &&
            browser.extension.inIncognitoContext) {
            return;
        }

        let handlesRegex = await browser.storage.local.get("knownTwitterHandleMatcher");
        const knownTwitterHandleMatcher = handlesRegex.knownTwitterHandleMatcher;

        /** @constant {number} - milliseconds to wait before checking */
        const waitMs = 2000;
        /** sleep and then check for tweets*/
        setTimeout(checkTweets, waitMs);
        /**
         * @function
         * @name checkPosts checks tweets from known handles
         */
        function checkTweets() {
            // retrieve tweets from dom
            let tweetsFromKnownHandles = Array.from(document.body.querySelectorAll("a[href]")).map(element => relativeToAbsoluteUrl(element.href)).filter(url => knownTwitterHandleMatcher.test(url));
            if (tweetsFromKnownHandles.length > 0)
                sendTweetExposure([...new Set(tweetsFromKnownHandles)]);
        }
        /**
         * Sends message to background script
         * @param {Array} twitter handles
         */
        function sendTweetExposure(tweets) {
            browser.runtime.sendMessage({
                type: "WebScience.Measurements.SocialMediaAccountExposure",
                posts: tweets,
                loadTime: initialLoadTime,
                platform: "twitter"
            });
        }
    }
)();