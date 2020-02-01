/**
 * Content script for social media sharing study
 * @module WebScience.Studies.content-scripts.socialMediaSharing
 */
(async function() {
    // stop running if this is an incognito window and we're not supposed to run there
    var privateWindowResults = await browser.storage.local.get("WebScience.Studies.SocialMediaSharing.privateWindows");
    if (("WebScience.Studies.SocialMediaSharing.privateWindows" in privateWindowResults)
        && !privateWindowResults["WebScience.Studies.SocialMediaSharing.privateWindows"]
        && browser.extension.inIncognitoContext) { return; }

    /**
     * Find links inside a node that's part of a Facebook post
     * @param node -- the node to search inside
     * @param response -- an object to add found links to
     */
    function searchFacebookPost(node, response) {
        // This is the class name used for the display boxes for news articles
        // When a post contains one link and it's at the end of the post, the url
        //  isn't included in the post text, so we have to find it here instead.
        var mediaBoxes = node.querySelectorAll("a[class=_52c6]")
        for (var mediaBox of mediaBoxes) {
            var rawUrl = mediaBox.getAttribute("href");
            var parsedUrl = removeShim(rawUrl).url;
            response.urlsInMediaBox.push(parsedUrl);
        }
        // It would be nice to just search the actual text of the post, the way we do
        //  with most other social media posts, but unfortunately Facebook
        //  shortens the display text with '...'s, so we have to go find the 
        //  hrefs themselves.
        var postBodies = node.querySelectorAll("div[data-testid=post_message]");
        for (var postBody of postBodies) {
            var urlsInPostBody = postBody.querySelectorAll("a[href]")
            for (var href of urlsInPostBody) {
                var rawUrl = href.getAttribute("href");
                var parsedUrl = removeShim(rawUrl).url;
                response.urlsInPostBody.push(parsedUrl);
            }
        }
    }

    /**
     * Send a fetch request for the post we're looking for, and parse links from the result
     * @param request -- the request post's ID and the ID of the person who shared it
     * @param response -- an object set up with arrays for the links to return
     */
    function requestPostContents(request, response) {
        return fetch(`https://www.facebook.com/permalink.php?story_fbid=${request.sharedFromPostId}&id=${request.ownerId}`)
            .then((responseFromFetch) => {
                return responseFromFetch.text().then((text) => {
                    text = text.replace(/<!-- </g, "<");
                    text = text.replace(/> -->/g, ">");
                    doc = (new DOMParser()).parseFromString(text, "text/html");
                    searchFacebookPost(doc, response);
                    return response;
                });
            });
    }

    browser.runtime.onMessage.addListener(request => {
        var response = { urlsInMediaBox: [], urlsInPostBody: [] };
        // Try to find the post on the page (should be in view)
        var requestedPost = document.body.querySelector(`a[href*="story_fbid=${request.sharedFromPostId}"]`);
        if (requestedPost == null) {
            // if we couldn't find the post on the page, fall back to requesting it from facebook
            return requestPostContents(request, response).then((ret) => { return ret; });
        }

        var node = requestedPost;
        // walk up the page structure, looking for links
        while (node.parentElement != null) {
            node = node.parentElement;
            if (node.hasAttribute("class") && node.getAttribute("class").includes("userContentWrapper")) {
                searchFacebookPost(node, response);
            }
            // when the user is sharing something from an existing reshare post,
            //  the media box isn't inside the userContentWrapper (it's at the top of
            //  the reshare post, above the share buttons).
            // To find it, we look for this clearfix class which encloses the media box.
            if (node.hasAttribute("class") && node.getAttribute("class").includes("_5pcr clearfix")) {
                searchFacebookPost(node, response);
            }
        }
        return Promise.resolve(response);
    });
})();