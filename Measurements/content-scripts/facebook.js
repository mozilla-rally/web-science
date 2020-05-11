/**
 * Content script for getting Facebook post contents
 * @module WebScience.Measurements.content-scripts.socialMediaSharing
 */
(async function() {
    // stop running if this is an incognito window and we're not supposed to run there
    var privateWindowResults = await browser.storage.local.get("WebScience.Studies.SocialMediaLinkSharing.privateWindows");
    if (("WebScience.Studies.SocialMediaLinkSharing.privateWindows" in privateWindowResults)
        && !privateWindowResults["WebScience.Studies.SocialMediaLinkSharing.privateWindows"]
        && browser.extension.inIncognitoContext) { return; }

    // Let the background page know that the script is loaded and which tab it's in
    browser.runtime.sendMessage({type: "WebScience.Utilities.SocialMediaActivity",
                                 platform: "facebook"});

    /**
     * Find links and text inside a node that's part of a Facebook post
     * @param node -- the node to search inside
     * @param response -- an object to add found links to
     */
    function searchFacebookPost(node, response) {
        response.attachedUrls = [];
        response.content = [];
        // This is the class name used for the display boxes for news articles
        // When a post contains one link and it's at the end of the post, the url
        //  isn't included in the post text, so we have to find it here instead.

        var mediaBoxes = node.querySelectorAll("a[class=_52c6]")
        for (var mediaBox of mediaBoxes) {
            var rawUrl = mediaBox.getAttribute("href");
            var parsedUrl = removeShim(rawUrl).url;
            response.attachedUrls.push(parsedUrl);
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

    /**
     * Send a fetch request for the post we're looking for, and parse links from the result
     * @param request -- the request post's ID and the ID of the person who shared it
     * @param response -- an object set up with arrays for the links to return
     */
    async function getFullUrl(request) {
        return new Promise((resolve, reject) => {
            var reqString = `https://www.facebook.com/${request.postId}`;
            fetch(reqString, {credentials: 'include'}).then((responseFromFetch) => {
                var redir = responseFromFetch.url;
                var groupsIndex = redir.indexOf("/groups/");
                var domainIndex = redir.indexOf("facebook.com/");
                var usernameEndIndex = redir.indexOf("/posts/");
                var username = "";
                var groupName = "";
                var newUrl = "";
                if (groupsIndex > 0) {
                    groupName = redir.substring(groupsIndex + 8, redir.indexOf("/?post_id="));
                    newUrl = `facebook.com/groups/${groupName}/permalink/${request.postId}`;
                } else {
                    if (domainIndex >= 0 && usernameEndIndex > 0) {
                        username = redir.substring(domainIndex + 13, usernameEndIndex);
                        newUrl = `facebook.com/${username}/posts/${request.postId}`;
                    }
                }
                resolve({newUrl: newUrl, groupName: groupName, username: username});
            });
        });
    }

    browser.runtime.onMessage.addListener(async (request) => {
        return new Promise(async (resolve, reject) => {
            var response = {};
            response.content = [];
            response.attachedUrls = [];

            // Try to find the post on the page (should be in view)
            var requestedPost = document.body.querySelector(`a[href*="${request.postId}"]`);
            var detailsObj = await getFullUrl(request);
            var newUrl = detailsObj.newUrl;
            var username = detailsObj.username;
            var groupName = detailsObj.groupName;
            response.username = username;
            response.groupName = groupName;
            // walk up the page structure, looking for links
            var node = requestedPost;

            // New FB
            try {
                var posts = document.querySelectorAll('div[role="article"]');
                var wantedPost;
                for (var post of posts) {
                    if (post.hasAttribute("aria-label")) continue;
                    if (post.querySelector(`a[href*="${newUrl}"]`)) {
                        wantedPost = post;
                        break;
                    }
                }
                var wantedPost = wantedPost.childNodes[0].childNodes[2];
                var content = wantedPost.childNodes[0];
                if (wantedPost.childNodes.length > 1) {
                    var attachment = wantedPost.childNodes[1];
                } else {
                    var attachment = null;
                }
                if (content.textContent) response.content.push(content.textContent);
                var internalLinks = content.querySelectorAll('a[href]');
                for (var link of internalLinks) {
                    response.content.push(removeShim(link.href).url);
                }
                if (attachment) {
                    var attachmentLinks = attachment.querySelectorAll('a[href]');
                    for (var link of attachmentLinks) {
                        if (link.hasAttribute("aria-label") &&
                            link.getAttribute("aria-label") == "More") continue;
                        response.attachedUrls.push(removeShim(link.href).url);
                    }
                }
                resolve(response);

            } catch (error) {
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
            }
        });
    });
})();
