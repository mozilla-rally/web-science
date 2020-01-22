/**
 * Content script for measuring exposure to content from known media accounts on Facebook
 * @module WebScience.Studies.content-scripts.socialMediaAccountExposure
 */
(
    async function () {

      async function checkPrivateWindowSupport() {
        let privateWindowResults = await browser.storage.local.get("WebScience.Studies.SocialMediaAccountExposure.privateWindows");
        return ("WebScience.Studies.SocialMediaAccountExposure.privateWindows" in privateWindowResults) &&
          !privateWindowResults["WebScience.Studies.SocialMediaAccountExposure.privateWindows"] &&
          browser.extension.inIncognitoContext;
      }

      let isExit = await checkPrivateWindowSupport();
      if (isExit) {
          return;
      }
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
            let posts = Array.from(document.body.querySelectorAll(fbpost));
            let postsFromKnownMedia = posts.filter(checkPostForKnownMediaOutlet);
            let mediaPosts = postsFromKnownMedia.map(x => {
               let urls = Array.from(x.querySelectorAll(postLinkSelector));
               if(urls.length > 0) {
                   return urls[0].href;
               }
               return "";
            });
            sendMessage(mediaPosts.filter(x => x.length > 0));
        }
        /**
         * Checks if the post is from a known media outlet
         * @param {HTMLElement} post - facebook post returned from query selector 
         * @returns {boolean} - true if post has <a> elements, no title (i.e., post from non-users ?) and the media organization is known
         */
        function checkPostForKnownMediaOutlet(post) {
            let links = Array.from(post.querySelectorAll(linkSelector));
            if(links.length == 0) {
                return false;
            }
            // check if post has title in any of the links
            let hasTitle = links.some(x => {
                return x.attributes.getNamedItem("title") != null;
            });
            // check if the post is from known media
            let knownMedia = links.some(x => {
                return fbAccountMatcher.test(x.href);
            });
            if(hasTitle || !knownMedia) {
                return false;
            }
            return true;
        }
        /**
         * Sends message to background script
         * @param {Array} posts - facebook post urls
         */
        function sendMessage(posts) {
            browser.runtime.sendMessage({
                type: "WebScience.Studies.SocialMediaAccountExposure.Facebook",
                posts: posts.join(",")
            });
        }
    }
)();