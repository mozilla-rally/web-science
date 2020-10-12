/**
 * Content script for getting Facebook post contents
 * @module WebScience.Measurements.content-scripts.SocialMediaLinkSharing
 */

(async function() {

    // stop running if this is an incognito window and we're not supposed to run there
    var privateWindowResults = await browser.storage.local.get("WebScience.Measurements.SocialMediaLinkSharing.privateWindows");
    if (("WebScience.Measurements.SocialMediaLinkSharing.privateWindows" in privateWindowResults)
        && !privateWindowResults["WebScience.Measurements.SocialMediaLinkSharing.privateWindows"]
        && browser.extension.inIncognitoContext) { return; }

    // Let the background page know that the script is loaded and which tab it's in
    browser.runtime.sendMessage({type: "WebScience.Utilities.SocialMediaActivity",
                                 platform: "facebook"});


    var trackedReshares = []
    var mostRecentReshare = null;

    function logReshareClick(clicked) {
        var node = clicked.srcElement;
        mostRecentReshare = node;
        var profile = null;
        var type = null;
        var posts = document.querySelectorAll('div[role="article"]');
        for (var post of posts) {
            if (post.contains(mostRecentReshare)) {
                var internal = /https:\/\/www.facebook.com\//;
                var links = post.querySelectorAll("a[href]");
                for (var link of links) {
                    if (internal.test(link.getAttribute("href"))) {
                        profile = link;
                        break;
                    }
                }
                fetch(profile.getAttribute("href"), {"credentials":"omit"}).then((rFF) => {
                    rFF.text().then((text) => {
                        var u0 = /u0040type":"([a-zA-Z0-9]*)"/;
                        var uType = u0.exec(text);
                        if (uType == null || (uType.length > 1 && uType[1] == "Person")) {
                            type = "person";
                        } else type = "page";
                        mostRecentReshare = type;
                    });
                });
            }
        }
    }

    function reshareSourceTracking() {
        var reshareButtons = document.querySelectorAll("div[aria-label*='Send this to friends']");
        for (var reshareButton of reshareButtons) {
            if (!(trackedReshares.includes(reshareButton))) {
                trackedReshares.push(reshareButton);
                reshareButton.addEventListener("click", logReshareClick);
            }
        }
    }

    let timer = setInterval(() => reshareSourceTracking(), 3000);


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

    function parseFacebookUrl(url) {
        var oldGroupRegex = /facebook\.com\/groups\/([^\/]*)\/permalink\/([0-9]*)/;
        var newGroupRegex = /facebook\.com\/groups\/([^\/]*)\/\?post_id=([0-9]*)/;
        var userIdRegex = /facebook\.com\/permalink\.php\?story_fbid=([0-9]*)&id=([0-9]*)/;
        var usernameRegex = /facebook\.com\/([^\/]*)\/posts\/([0-9]*)/;
        var username = ""; var groupName = ""; var newUrl = ""; var userId = "";
        var oldGroupResult = oldGroupRegex.exec(url);
        if (oldGroupResult) {
            groupName = oldGroupResult[1];
            newUrl = `facebook.com/groups/${groupName}/permalink/${request.postId}`;
        }
        var newGroupResult = newGroupRegex.exec(url);
        if (newGroupResult) {
            groupName = newGroupResult[1];
            newUrl = `facebook.com/groups/${groupName}/permalink/${request.postId}`;
        }
        var idResult = userIdRegex.exec(url);
        if (idResult) {
            userId = idResult[2];
            newUrl = idResult[0];
        }
        var nameResult = usernameRegex.exec(url);
        if (nameResult) {
            username = nameResult[1];
            newUrl = nameResult[0];
        }
        return({newUrl: newUrl, groupName: groupName, username: username, userId: userId});
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
                resolve(parseFacebookUrl(redir));
                /*
                var oldGroupRegex = /facebook\.com\/groups\/([^\/]*)\/permalink\/([0-9]*)/;
                var newGroupRegex = /facebook\.com\/groups\/([^\/]*)\/\?post_id=([0-9]*)/;
                var userIdRegex = /facebook\.com\/permalink\.php\?story_fbid=([0-9]*)&id=([0-9]*)/;
                var usernameRegex = /facebook\.com\/([^\/]*)\/posts\/([0-9]*)/;
                var username = ""; var groupName = ""; var newUrl = ""; var userId = "";
                var oldGroupResult = oldGroupRegex.exec(redir);
                if (oldGroupResult) {
                    groupName = oldGroupResult[1];
                    newUrl = `facebook.com/groups/${groupName}/permalink/${request.postId}`;
                }
                var newGroupResult = newGroupRegex.exec(redir);
                if (newGroupResult) {
                    groupName = newGroupResult[1];
                    newUrl = `facebook.com/groups/${groupName}/permalink/${request.postId}`;
                }
                var idResult = userIdRegex.exec(redir);
                if (idResult) {
                    userId = idResult[2];
                    newUrl = idResult[0];
                }
                var nameResult = usernameRegex.exec(redir);
                if (nameResult) {
                    username = nameResult[1];
                    newUrl = nameResult[0];
                }
                resolve({newUrl: newUrl, groupName: groupName, username: username, userId: userId});
                */
            });
        });
    }

    function findContent(wantedPost, newUrl) {
        var counter = 0
        while (true){
            if (counter > 10) return wantedPost;
            counter += 1;
            if (wantedPost.childNodes && wantedPost.childNodes.length == 1) {
                wantedPost = wantedPost.childNodes[0];
            }
            else return wantedPost;
        }
        return wantedPost;
    }

    function recStructure(node) {
        var links = [];//node.querySelectorAll ? node.querySelectorAll(`a[target='_blank']`) : [];
        var ret;
        if (node.textContent == "") {
            links = node.querySelectorAll ? node.querySelectorAll(`a[target='_blank']`) : [];
            links = Array.prototype.map.call(links, link => link.href ? removeShim(link.href).url : null);
            if (node.target && node.href && node.target == "_blank") {
                links.push(removeShim(node.href).url);
            }
            if (links.length == 0) return null;
            ret = {"text": null, "links": links};
            return ret;
        }
        if (node.childNodes.length == 0) {
            links = node.querySelectorAll ? node.querySelectorAll(`a[target='_blank']`) : [];
            links = Array.prototype.map.call(links, link => link.href ? removeShim(link.href).url : null);
            if (node.target && node.href && node.target == "_blank") {
                links.push(removeShim(node.href).url);
            }
            ret = {"text": node.textContent, "links": links};
            return ret;
        }
        var children = [];
        for (var child of node.childNodes) {
            var childContent = recStructure(child);
            if (childContent != null) children.push(childContent);
        }
        if (children.length == 0) {
            console.log("ERROR", node, children, node.textContent, links);
        }
        ret = children.length == 0 ? null : (children.length == 1 ? children[0] : children);
        return ret;
    }

    function isComments(structure) {
        if (structure == null) return false;
        if (structure.hasOwnProperty("text")) return false;
        if (structure.length >= 2) {
            if (structure[0].hasOwnProperty("text") && structure[0].text == "Like" &&
                structure[1].hasOwnProperty("text") && structure[1].text == "Comment") {
                return true;
            }
        }
        for (var child of structure) {
            if (isComments(child)) {
                return true;
            }
        }
        return false;
    }

    function removeComments(structure) {
        var index = 0;
        for (var child of structure) {
            var childIsComments = isComments(child);
            if (childIsComments) {
                structure.splice(index, 1);
                return;
            }
            index += 1;
        }
        return structure;
    }

    function condenseContent(structure, text, links) {
        if (structure == null) {
            console.log("ERROR", structure, text, links);
            return;
        }
        if (structure.hasOwnProperty("text") && structure.hasOwnProperty("links")) {
            if (structure.text != null) text.push(structure.text);
            for (var link of structure.links) {
                links.push(link);
            }
            return;
        }
        for (var child of structure) {
            condenseContent(child, text, links);
        }
    }

    browser.runtime.onMessage.addListener(async (request) => {
        return new Promise(async (resolve, reject) => {
            if ("recentReshare" in request) {
                resolve(mostRecentReshare);
                return;
            }
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
                var recStructureWanted = recStructure(wantedPost);
                var textRet = [];
                var linksRet = [];
                removeComments(recStructureWanted);
                condenseContent(recStructureWanted, textRet, linksRet);
                response.content = textRet;
                response.attachedUrls = linksRet;
                resolve(response);
                return;
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

