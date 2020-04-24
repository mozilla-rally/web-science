/**
 * Content script for measuring news exposure on youtube
 * @module WebScience.Measurements.content-scripts.socialMediaNewsExposure
 */
(
    async function () {


        /** time when the document is loaded */
        let initialLoadTime = Date.now();

        // Checks if the script should exit because private windows are not supported for SocialMediaNewsExposure
        let privateWindowResults = await browser.storage.local.get("WebScience.Measurements.SocialMediaNewsExposure.privateWindows");
        if (("WebScience.Measurements.SocialMediaNewsExposure.privateWindows" in privateWindowResults) &&
            !privateWindowResults["WebScience.Measurements.SocialMediaNewsExposure.privateWindows"] &&
            browser.extension.inIncognitoContext) {
            return;
        }

        // ytcategory is the news category string for youtube videos
        const ytcategory = "CategoryNews&Politics";
        // raw category string
        /** @constant {number} milliseconds */
        const waitMs = 2000;
        /** @constant click when set to true clicks Show More to retrieve video category */
        const click = false;
        /** listener for new videos loaded; youtube doesn't reload page. It uses history api. */
        document.body.addEventListener("yt-navigate-finish", function (event) {
            setTimeout(checkNews, waitMs);
        });

        /** sleep and then check for news video */
        setTimeout(checkNews, waitMs);
        /**
         * @function
         * @name checkNews function checks if the current webpage has youtube watch/embed url
         * for valid youtube videos, it checks if the video category is News & Politics
         * NOTE : if the inner html doesn't contain News & Politics, then the function
         * clicks on Show More and then checks DOM for video category
         */
        function checkNews() {
            let isNewsVideo = false;
            isNewsVideo = checkForNewsCategoryFromText();
            if (!isNewsVideo && click) {
                //alert(document.querySelector(".more-button"));
                document.querySelector(".more-button").click();
                setTimeout(function () {
                    isNewsVideo = checkForNewsCategoryFromClick();
                }, waitMs);
            }
            if (isNewsVideo) {
                sendMediaNewsExposureEvent();
            }
        }
        /** @name checkForNewsCategoryFromText checks if inner html has News & Politics string */
        function checkForNewsCategoryFromText() {
            let arr = [...document.documentElement.innerHTML.matchAll("News \\\\u0026 Politics")];
            return arr.length > 0;
        }
        /**
         * Checks news category after the show more button is clicked
         * @returns {boolean} - true if the video category is News & Politics
         * @private
         */
        function checkForNewsCategoryFromClick() {
            // get Category element using the class name
            elements = document.getElementsByClassName("style-scope ytd-metadata-row-container-renderer");
            for (i = 0; i < elements.length; i++) {
                // if the element has text content
                if (elements[i].textContent.length > 0) {
                    // check if the text content after stripping whitespace matches News&Politics string
                    str = elements[i].textContent.replace(/^\s+|\s+$/g, '').replace(/\n/g, "").replace(/\s{1,}/g, "");
                    if (str == ytcategory) {
                        return true;
                    }
                }
            }
            return false;
        }
        /**
         * Sends video title, url of news related videos on Youtube to background script
         */
        function sendMediaNewsExposureEvent() {
            let videoTitle = document.querySelector("h1.title.style-scope.ytd-video-primary-info-renderer").textContent;
            browser.runtime.sendMessage({
                type: "WebScience.Measurements.SocialMediaNewsExposure.Youtube",
                url: document.location.href,
                loadTime: initialLoadTime,
                title: videoTitle
            });
        }
    }
)();