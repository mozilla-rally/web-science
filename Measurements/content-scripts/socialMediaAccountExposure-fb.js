/**
 * Content script for measuring exposure to content from known media accounts on Facebook
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

        let accountsRegex = await browser.storage.local.get("knownFacebookAccountsMatcher");
        const knownMediaAccountMatcher = accountsRegex.knownFacebookAccountsMatcher;

        /** @constant {string} - facebook post selector */
        const fbpost = "div[id^=hyperfeed_story]";
        const linkSelector = "a[href*=__tn__]";
        const postLinkSelector = "a[href*=php]";
        /** @constant {number} - milliseconds to wait before checking */
        const waitMs = 2000;
        /** sleep and then check for news video */
        setTimeout(checkPosts, waitMs);
        /**
         * @function
         * @name checkPosts checks facebook posts for posts from known media outlets
         */
        function checkPosts() {
            // retrieve posts from dom
            let posts = Array.from(document.body.querySelectorAll(fbpost));
            let postsFromKnownMedia = [];
            for (i = 0; i < posts.length; i++) {
                // check if the post from a known media outlet
                let checkResult = checkPostForKnownMediaOutlet(posts[i]);
                if (checkResult.isFromKnownMedia) {
                    // get link to the post (not the link to media outlets page)
                    let urls = Array.from(posts[i].querySelectorAll(postLinkSelector));
                    if (urls.length > 0) {
                        postsFromKnownMedia.push({post: urls[0].href, account : checkResult.account});
                    }
                }
            }
            if(postsFromKnownMedia.length > 0)
            sendMessage(postsFromKnownMedia);
        }
        /**
         * Checks if the post is from a known media outlet
         * @param {HTMLElement} post - facebook post returned from query selector 
         * @returns {Object} - true if post has <a> elements, no title (i.e., post from non-users ?) and the media organization is known
         */
        function checkPostForKnownMediaOutlet(post) {
            let postLinks = Array.from(post.querySelectorAll(linkSelector));
            if (postLinks.length == 0) {
                return { isFromKnownMedia : false, account : undefined};
            }
            // check if any of links has title attribute
            let hasTitle = postLinks.some(link => {
                return link.attributes.getNamedItem("title") != null;
            });
            if(hasTitle) {
                // Observation : Posts from user account have title attribute. Therefore, this post cannot be from media outlet.
                return { isFromKnownMedia : false, account : undefined};
            }
            // now check if the post is from known media
            let knownMedia = postLinks.find(link => {
                return knownMediaAccountMatcher.test(link.href);
            });
            return { isFromKnownMedia : knownMedia !== undefined, account : (knownMedia === undefined ? undefined : knownMedia.href.split('?')[0])};
        }
        /**
         * Sends message to background script
         * @param {Array} posts - facebook post urls
         */
        function sendMessage(posts) {
            browser.runtime.sendMessage({
                type: "WebScience.Measurements.SocialMediaAccountExposure",
                posts: posts,
                loadTime: initialLoadTime,
                platform: "facebook"
            });
        }
    }
)();
