/**
 * Content script for getting Facebook post contents
 * @module WebScience.Studies.content-scripts.socialMediaSharing
 */
(async function() {
    // Let the background page know that the script is loaded and which tab it's in
    browser.runtime.sendMessage({type: "WebScience.Utilities.SocialMediaActivity",
                                 platform: "facebook"});

    // stop running if this is an incognito window and we're not supposed to run there
    var privateWindowResults = await browser.storage.local.get("WebScience.Studies.SocialMediaSharing.privateWindows");
    if (("WebScience.Studies.SocialMediaSharing.privateWindows" in privateWindowResults)
        && !privateWindowResults["WebScience.Studies.SocialMediaSharing.privateWindows"]
        && browser.extension.inIncognitoContext) { return; }

    /**
     * Find links and text inside a node that's part of a Facebook post
     * @param node -- the node to search inside
     * @param response -- an object to add found links to
     */
    function searchFacebookPost(node, response) {
        response.urlsInMediaBox = [];
        response.content = [];
        // This is the class name used for the display boxes for news articles
        // When a post contains one link and it's at the end of the post, the url
        //  isn't included in the post text, so we have to find it here instead.

        var mediaBoxes = node.querySelectorAll("a[class=_52c6]")
        for (var mediaBox of mediaBoxes) {
            var rawUrl = mediaBox.getAttribute("href");
            var parsedUrl = removeShim(rawUrl).url;
            response.urlsInMediaBox.push(parsedUrl);
        }

        var postBodies = node.querySelectorAll("div[data-testid=post_message]");
        for (var postBody of postBodies) {
            for (var elem of postBody.childNodes[0].childNodes) {
                if (elem.nodeName == "A") {
                    response.content.push(removeShim(elem.href).url);
                }
                if(elem.nodeName == "#text") {
                    response.content.push(elem.data);
                }
            }
        }
    }

    browser.runtime.onMessage.addListener((request) => {
        return new Promise((resolve, reject) => {
            var response = {};
            // Try to find the post on the page (should be in view)
            var requestedPost = document.body.querySelector(`a[href*="${request.postId}"]`);
            var node = requestedPost;
            // walk up the page structure, looking for links
            while (node.parentElement != null) {
                node = node.parentElement;
                if (node.hasAttribute("class") &&
                    node.getAttribute("class").includes("userContentWrapper")) {
                    searchFacebookPost(node, response);
                }
                // when the user is sharing something from an existing reshare post,
                //  the media box isn't inside the userContentWrapper (it's at the top of
                //  the reshare post, above the share buttons).
                // To find it, we look for this clearfix class which encloses the media box.
                if (node.hasAttribute("class") &&
                    node.getAttribute("class").includes("_5pcr clearfix")) {
                    searchFacebookPost(node, response);
                }
            }
            resolve(response);
        });
    });
})();
