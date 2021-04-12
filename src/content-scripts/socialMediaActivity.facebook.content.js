/**
 * Content script for getting Facebook post contents
 * @module webScience.socialMediaActivity.facebook.content
 */

import { facebookLinkShimRegExp, parseFacebookLinkShim, removeFacebookLinkDecoration } from "../linkResolution.js";


// async IIFE wrapper to enable await syntax
(async function() {

    // stop running if this is an incognito window and we're not supposed to run there
    const privateWindowResults = await browser.storage.local.get("webScience.socialMediaLinkSharing.privateWindows");
    if (("webScience.socialMediaLinkSharing.privateWindows" in privateWindowResults)
        && !privateWindowResults["webScience.socialMediaLinkSharing.privateWindows"]
        && browser.extension.inIncognitoContext) { return; }

    // Let the background page know that the script is loaded and which tab it's in
    browser.runtime.sendMessage({type: "webScience.socialMediaActivity",
                                 platform: "facebook"});


    const trackedReshares = []
    let mostRecentReshare = null;

    function logReshareClick(clicked) {
        const node = clicked.srcElement;
        mostRecentReshare = node;
        let profile = null;
        let type = null;
        const posts = document.querySelectorAll('div[role="article"]');
        for (const post of posts) {
            if (post.contains(mostRecentReshare)) {
                const internal = /https:\/\/www.facebook.com\//;
                const links = post.querySelectorAll("a[href]");
                for (const link of links) {
                    if (internal.test(link.getAttribute("href"))) {
                        profile = link;
                        break;
                    }
                }
                fetch(profile.getAttribute("href"), {"credentials":"omit"}).then((rFF) => {
                    rFF.text().then((text) => {
                        const u0 = /u0040type":"([a-zA-Z0-9]*)"/;
                        const uType = u0.exec(text);
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
        const reshareButtons = document.querySelectorAll("div[aria-label*='Send this to friends']");
        for (const reshareButton of reshareButtons) {
            if (!(trackedReshares.includes(reshareButton))) {
                trackedReshares.push(reshareButton);
                reshareButton.addEventListener("click", logReshareClick);
            }
        }
    }

    setInterval(() => reshareSourceTracking(), 3000);


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

        const mediaBoxes = node.querySelectorAll("a[class=_52c6]")
        for (const mediaBox of mediaBoxes) {
            const rawUrl = mediaBox.getAttribute("href");
            const parsedUrl = removeShim(rawUrl).url;
            response.attachedUrls.push(parsedUrl);
        }

        const postBodies = node.querySelectorAll("div[data-testid=post_message]");
        for (const postBody of postBodies) {
            for (const elem of postBody.childNodes[0].childNodes) {
                if (elem.nodeName == "A") {
                    response.content.push(removeShim(elem.href).url);
                }
                if(elem.nodeName == "#text") {
                    response.content.push(elem.data);
                }
            }
        }
    }

    function parseFacebookUrl(url, request) {
        const oldGroupRegex = /facebook\.com\/groups\/([^/]*)\/permalink\/([0-9]*)/;
        const newGroupRegex = /facebook\.com\/groups\/([^/]*)\/\?post_id=([0-9]*)/;
        const userIdRegex = /facebook\.com\/permalink\.php\?story_fbid=([0-9]*)&id=([0-9]*)/;
        const usernameRegex = /facebook\.com\/([^/]*)\/posts\/([0-9]*)/;
        let username = ""; let groupName = ""; let newUrl = ""; let userId = "";
        const oldGroupResult = oldGroupRegex.exec(url);
        if (oldGroupResult) {
            groupName = oldGroupResult[1];
            newUrl = `facebook.com/groups/${groupName}/permalink/${request.postId}`;
        }
        const newGroupResult = newGroupRegex.exec(url);
        if (newGroupResult) {
            groupName = newGroupResult[1];
            newUrl = `facebook.com/groups/${groupName}/permalink/${request.postId}`;
        }
        const idResult = userIdRegex.exec(url);
        if (idResult) {
            userId = idResult[2];
            newUrl = idResult[0];
        }
        const nameResult = usernameRegex.exec(url);
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
            const reqString = `https://www.facebook.com/${request.postId}`;
            fetch(reqString, {credentials: 'include'}).then((responseFromFetch) => {
                const redir = responseFromFetch.url;
                resolve(parseFacebookUrl(redir, request));
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

    function recStructure(node) {
        let links = [];//node.querySelectorAll ? node.querySelectorAll(`a[target='_blank']`) : [];
        let ret;
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
        const children = [];
        for (const child of node.childNodes) {
            const childContent = recStructure(child);
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
        if ("text" in structure) return false;
        if (structure.length >= 2) {
            if ("text" in structure[0] && structure[0].text == "Like" &&
                "text" in structure[1] && structure[1].text == "Comment") {
                return true;
            }
        }
        for (const child of structure) {
            if (isComments(child)) {
                return true;
            }
        }
        return false;
    }

    function removeComments(structure) {
        let index = 0;
        for (const child of structure) {
            const childIsComments = isComments(child);
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
        if ("text" in structure && "links" in structure) {
            if (structure.text != null) text.push(structure.text);
            for (const link of structure.links) {
                links.push(link);
            }
            return;
        }
        for (const child of structure) {
            condenseContent(child, text, links);
        }
    }

    /**
     * Removes url shim. Currently supports only facebook urls
     * @param {string} url
     * @returns {Object} url property whose value is same as input or deshimmed url depending on whether the input is
     * matches facebook shim format. A boolean isShim property that is true if the format matches
     */
    function removeShim(url) {
        // check if the url matches shim
        if (facebookLinkShimRegExp.test(url)) {
            return {
                url: removeFacebookLinkDecoration(parseFacebookLinkShim(url)),
                isShim: true
            };
        }
        return {
            url: url,
            isShim: false
        };
    }

    browser.runtime.onMessage.addListener(async (request) => {
        return new Promise((resolve, reject) => {
            if ("recentReshare" in request) {
                resolve(mostRecentReshare);
                return;
            }
            const response = {};
            response.content = [];
            response.attachedUrls = [];

            // Try to find the post on the page (should be in view)
            const requestedPost = document.body.querySelector(`a[href*="${request.postId}"]`);
            getFullUrl(request).then((detailsObj) => {
                const newUrl = detailsObj.newUrl;
                const username = detailsObj.username;
                const groupName = detailsObj.groupName;
                response.username = username;
                response.groupName = groupName;
                let node = requestedPost;

                // New FB
                try {
                    const posts = document.querySelectorAll('div[role="article"]');
                    let wantedPost;
                    for (const post of posts) {
                        if (post.hasAttribute("aria-label")) continue;
                        if (post.querySelector(`a[href*="${newUrl}"]`)) {
                            wantedPost = post;
                            break;
                        }
                    }
                    const recStructureWanted = recStructure(wantedPost);
                    const textRet = [];
                    const linksRet = [];
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
    });
})();

