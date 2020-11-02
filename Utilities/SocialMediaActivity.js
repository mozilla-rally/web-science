/**
 * This module provides utility functions for tracking social media posts.
 *
 * @module WebScience.Utilities.SocialMediaActivity
 */
import * as Debugging from "./Debugging.js"
import * as Messaging from "./Messaging.js"

const debugLog = Debugging.getDebuggingLog("SocialMediaSharing");

var privateWindows = false;

var tweetContentSetUp = false;
var twitter_x_csrf_token = "";
var twitter_authorization = "";
var twitter_tabid = "";

var fbPostContentSetUp = false;
var facebookTabId = -1;

var processedRequestIds = {};

/**
 * Configure listeners to run in private windows.
 */
export function enablePrivateWindows() {
    privateWindows = true;
}

/** Unregister old handlers for an event, and register a new one, if necessary.
 * Unregistering is only necessary when there's already a nonblocking handler registered
 * and we want to convert it to a blocking handler.
 * @param platform - which social media platform the event is for
 * @param eventType - which type of event we're registering
 * @param blockingType - whether the handler should be blocking or not
 * @param callback - the client function to call when the event occurs
 */
function registerPlatformListener(platform, eventType, blockingType, callback) {
    var blocking = blockingType == "blocking";
    var handler = platformHandlers[platform][eventType];

    if (handler.registeredListener == null ||
        (blockingType == "blocking" && handler.registeredBlockingType != "blocking")) {

        // if there is a nonblocking listener registered, we must be blocking (otherwise this code wouldn't run)
        // and if we're adding a blocking listener, we want to get rid of the nonblocking one
        if (handler.registeredListener != null && handler.registeredBlockingType == "nonblocking") {
            browser.webRequest[handler.stage].removeListener(handler.registeredListener);
        }
        var stage = handler.stage;
        var urls = handler.urls;
        handler.registeredListener = ((requestDetails) => {
            return handleGenericEvent({requestDetails: requestDetails, platform: platform,
                                eventType: eventType, blockingType: blockingType});
        });
        handler.registeredBlockingType = blockingType;
        browser.webRequest[stage].addListener(handler.registeredListener,
        {
            urls: urls,
            incognito: (privateWindows ? null : false)
        },
            blocking ? ["requestBody", blockingType] : ["requestBody"]);
    }
    clientCallbacks[platform][eventType][blockingType].push(callback);
}


/**
 * Register a callback for specific Twitter events. Supported events are "tweet" (includes
 * tweet variants such as replies), "retweet", and "favorite".
 * @param callback - the function to call when the event happens
 * @param [String] events - array of events to be tracked
 * @param blocking - whether the listener should be blocking. Allows canceling the event.
 */
export function registerTwitterActivityTracker(
    callback,
    events,
    blocking = false) {
    if (events.includes("tweet") || events.includes("<all_events>")) {
        registerPlatformListener("twitter", "tweet", blocking ? "blocking" : "nonblocking", callback);
    }
    if (events.includes("retweet") || events.includes("<all_events>")) {
        registerPlatformListener("twitter", "retweet", blocking ? "blocking" : "nonblocking", callback);
    }
    if (events.includes("favorite") || events.includes("<all_events>")) {
        registerPlatformListener("twitter", "favorite", blocking ? "blocking" : "nonblocking", callback);
    }
    tweetContentInit();
}

/**
 * Register a callback for specific Facebook events. Supported events are "post", "reshare",
 * "react" (includes like, love, etc), and "comment".
 * @param callback - the function to call when the event happens
 * @param [String] events - array of events to be tracked
 * @param blocking - whether the listener should be blocking. Allows canceling the event.
 */
export function registerFacebookActivityTracker(
    callback,
    events,
    blocking = false ){
    if (events.includes("post") || events.includes("<all_events>")) {
        registerPlatformListener("facebook", "post", blocking ? "blocking" : "nonblocking", callback);
    }
    if (events.includes("reshare") || events.includes("<all_events>")) {
        registerPlatformListener("facebook", "reshare", blocking ? "blocking" : "nonblocking", callback);
    }
    if (events.includes("react") || events.includes("<all_events>")) {
        registerPlatformListener("facebook", "react", blocking ? "blocking" : "nonblocking", callback);
    }
    if (events.includes("comment") || events.includes("<all_events>")) {
        registerPlatformListener("facebook", "comment", blocking ? "blocking" : "nonblocking", callback);
    }
    fbPostContentInit();
}

/**
 * Register a callback for specific Reddit events. Supported events are "post", "comment",
 * "postVote", and "commentVote".
 * @param callback - the function to call when the event happens
 * @param [String] events - array of events to be tracked
 * @param blocking - whether the listener should be blocking. Allows canceling the event.
 */
export function registerRedditActivityTracker(
    callback,
    events,
    blocking = false) {
    if (events.includes("post") || events.includes("<all_events>")) {
        registerPlatformListener("reddit", "post", blocking ? "blocking" : "nonblocking", callback);
    }
    if (events.includes("comment") || events.includes("<all_events>")) {
        registerPlatformListener("reddit", "comment", blocking ? "blocking" : "nonblocking", callback);
    }
    if (events.includes("postVote") || events.includes("<all_events>")) {
        registerPlatformListener("reddit", "postVote", blocking ? "blocking" : "nonblocking", callback);
    }
    if (events.includes("commentVote") || events.includes("<all_events>")) {
        registerPlatformListener("reddit", "commentVote", blocking ? "blocking" : "nonblocking", callback);
    }
}

/**
 * Upon receiving any event, validate that it is a valid instance of the tracked action,
 * call parsers to extract relevant information, and call a blocking callback if it exists.
 * If the blocking callback cancels the event by returning an object containing a "cancel"
 * property, cancel the request. Otherwise, let the request continue. If there is not a
 * blocking listener or it lets the event continue, call the nonblocking listeners.
 * @param requestDetails - the raw request event from WebRequests
 * @param platform - which social media platform this event is from
 * @param eventType - which event this request should be
 * @param blockingType - whether a blocking listener should run
 */
async function handleGenericEvent({requestDetails = null,
                             platform = null, eventType = null,
                             blockingType = null}) {
    var handler = platformHandlers[platform][eventType];
    return new Promise(async (resolve, reject) => {
        var eventTime = Date.now();
        var verified = null;
        for (var verifier of handler.verifiers) {
            verified = await verifier({requestDetails: requestDetails, platform: platform,
                                       eventType: eventType, blockingType: blockingType,
                                       eventTime: eventTime});
            if (!verified) {
                resolve({});
                return;
            }
        }
        if (platform == "facebook") {
            facebookTabId = requestDetails.tabId;
        }
        var details = {};
        for (var extractor of handler.extractors) {
            details = await extractor({requestDetails: requestDetails, details: details,
                                       verified: verified, platform: platform, eventType: eventType,
                                       blockingType: blockingType, eventTime: eventTime});
            if (!details) {
                resolve({});;
                return;
            }
        }
        var blockingResult;
        if (blockingType == "blocking") {
            blockingResult = await clientCallbacks[platform][eventType][blockingType][0](details);
            if (blockingResult && "cancel" in blockingResult) {
                resolve(blockingResult);
                return;
            } else {
                resolve({});
            }
        // If we have multiple listeners for the same URL and one is blocking,
            // all become blocking. Resolve to allow blocking to finish.
        } else {
            resolve({});
        }
        for (var userListener of clientCallbacks[platform][eventType]["nonblocking"]) {
            userListener(details);
        }
        for (var completer of handler.completers) {
        completer({requestDetails: requestDetails, verified: verified, details: details,
                           platform: platform, eventType: eventType, blockingType: blockingType});
        }
    });
}

/**
 * A generic verifier that makes sure a request is a POST.
 * @param requestDetails - the raw request
 */
function verifyPostReq({requestDetails = null}) {
    if (!requestDetails) return null;
    if (!requestDetails.method == "POST") return null;
    return {};
}

/**
 * A generic verifier that makes sure the formData field is present.
 * @param requestDetails - the raw request
 */
function verifyReadableFormData({requestDetails = null}) {
    if (!requestDetails.requestBody) return null;
    if (!requestDetails.requestBody.formData) return null;
    return {};
}

/**
 * Sometimes a redir gets issued (for the same url) and we see the event twice,
 * resulting in double-counting events. Check whether we've seen this requestId
 * already, cancel if so, and record the view if not.
 * Note: if multiple events listen to the same URL and distinguish events by
 * request contents, this verifier must be the LAST in the list
 * @param requestDetails - the raw request
 */
function verifyNewRequest({requestDetails = null}) {
    if (!requestDetails.requestId) return null;
    if (processedRequestIds[requestDetails.requestId]) {
        return null;
    }
    processedRequestIds[requestDetails.requestId] = true;
    return {};
}

/**
 * Stores the callback functions the client has registered.
 */
var clientCallbacks = {
    twitter: {
        tweet: {blocking: [], nonblocking: []},
        retweet: {blocking: [], nonblocking: []},
        favorite: {blocking: [], nonblocking: []},
    },
    facebook: {
        post: {blocking: [], nonblocking: []},
        react: {blocking: [], nonblocking: []},
        reshare: {blocking: [], nonblocking: []},
        comment: {blocking: [], nonblocking: []},
    },
    reddit: {
        post: {blocking: [], nonblocking: []},
        comment: {blocking: [], nonblocking: []},
        postVote: {blocking: [], nonblocking: []},
        commentVote: {blocking: [], nonblocking: []}
    }
}

/**
 * Holds the configuration for each type of handler.
 */
var platformHandlers = {
    twitter: {
        tweet: null, retweet: null, favorite: null
    },
    facebook: {
        post: null, comment: null, react: null, reshare: null
    },
    reddit: {
        post: null, comment: null, postVote: null, commentVote: null
    }
}

platformHandlers.twitter.tweet = {
    stage: "onBeforeRequest",
    urls: ["https://twitter.com/intent/tweet", "https://api.twitter.com/*/statuses/update.json", "https://twitter.com/i/api/*/statuses/update.json"],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyTwitterTweet],
    extractors: [extractTwitterTweet],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.twitter.retweet = {
    stage: "onBeforeRequest",
    urls: ["https://api.twitter.com/*/statuses/retweet.json", "https://twitter.com/i/api/*/statuses/retweet.json"],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyTwitterRetweet],
    extractors: [extractTwitterRetweet],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.twitter.favorite = {
    stage: "onBeforeRequest",
    urls: ["https://api.twitter.com/*/favorites/create.json",
           "https://twitter.com/i/api/*/favorites/create.json"],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyTwitterFavorite],
    extractors: [extractTwitterFavorite],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};

platformHandlers.facebook.post = {
    stage: "onBeforeRequest",
    urls: ["https://www.facebook.com/webgraphql/mutation/?doc_id=*", // Old FB
           "https://www.facebook.com/api/graphql/" // New FB
          ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyFacebookPost, verifyNewRequest],
    extractors: [extractFacebookPost],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.facebook.react = {
    stage: "onBeforeRequest",
    urls: ["https://www.facebook.com/api/graphql/"],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyFacebookReact],
    extractors: [extractFacebookReact],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.facebook.comment = {
    stage: "onBeforeRequest",
    urls: ["https://www.facebook.com/api/graphql/"],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyFacebookComment],
    extractors: [extractFacebookComment],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.facebook.reshare = {
    stage: "onBeforeRequest",
    urls: ["https://www.facebook.com/share/dialog/submit/*", // Old FB
           "https://www.facebook.com/api/graphql/" // New FB
          ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyFacebookReshare, verifyNewRequest],
    extractors: [extractFacebookReshare],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};

platformHandlers.reddit.post = {
    stage: "onBeforeRequest",
    urls: [ "https://oauth.reddit.com/api/submit*" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyRedditPost],
    extractors: [extractRedditPost],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.reddit.comment = {
    stage: "onBeforeRequest",
    urls: [ "https://oauth.reddit.com/api/comment*" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyRedditComment],
    extractors: [extractRedditComment],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.reddit.postVote = {
    stage: "onBeforeRequest",
    urls: [ "https://oauth.reddit.com/api/vote*" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyRedditPostVote],
    extractors: [extractRedditPostVote],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.reddit.commentVote = {
    stage: "onBeforeRequest",
    urls: [ "https://oauth.reddit.com/api/vote*" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyNewRequest, verifyRedditCommentVote],
    extractors: [extractRedditCommentVote],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};

/**
 * Ensure that a tweet request contains a readable tweet.
 * @param requestDetails - the raw request
 * @returns - null when invalid, otherwise an object indicating whether the request comes from
 *  a service worker (not currently used).
 */
function verifyTwitterTweet({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.status)) return null;
    if (!(requestDetails.requestBody.formData.status.length > 0)) return null;
    if (requestDetails.tabId >= 0) return {serviceWorker: false};
    if (requestDetails.documentUrl.endsWith("sw.js")) return {serviceWorker: true};
    else { return null; }
}

/**
 * Extract info from a tweet.
 * @param {Object} requestDetails
 * @returns {Object} - the tweet info extracted into an object
 */
function extractTwitterTweet({requestDetails = null}) {
    var details = {};
    details.eventType = "tweet";
    details.eventTime = requestDetails.timeStamp;
    var tweetText = requestDetails.requestBody.formData["status"][0];
    details.postText = tweetText;
    if (requestDetails.requestBody.formData.attachment_url &&
        requestDetails.requestBody.formData.attachment_url.length > 0) {
        details.postAttachments = requestDetails.requestBody.formData.attachment_url;
    } else {
        details.postAttachments = null;
    }
    return details;
}

/**
 * Ensure that a retweet request contains a readable retweet.
 * @param requestDetails - the raw request
 * @returns - null when invalid, otherwise an object indicating whether the request comes from
 *  a service worker (not currently used).
 */
function verifyTwitterRetweet({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.id)) return null;
    if (!(requestDetails.requestBody.formData.id.length > 0)) return null;
    if (requestDetails.tabId >= 0) return {serviceWorker: false};
    if (requestDetails.documentUrl.endsWith("sw.js")) return {serviceWorker: true};
}

/**
 * Extract info from a retweet.
 * @param {Object} requestDetails
 * @returns {Object} - the retweet info extracted into an object
 */
function extractTwitterRetweet({requestDetails = null, eventTime = null}) {
    var tweetId = requestDetails.requestBody.formData.id[0];
    var details = {};
    details.eventType = "retweet";
    details.eventTimestamp = requestDetails.timeStamp;
    details.retweetedId = tweetId;
    details.eventTime = eventTime;
    return details;
}

/**
 * Ensure that a favorite request contains a readable favorite.
 * @param requestDetails - the raw request
 * @returns - null when invalid, otherwise an object indicating whether the request comes from
 *  a service worker (not currently used).
 */
function verifyTwitterFavorite({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.id)) return null;
    if (!(requestDetails.requestBody.formData.id.length > 0)) return null;
    if (requestDetails.tabId >= 0) return {serviceWorker: false};
    if (requestDetails.documentUrl.endsWith("sw.js")) return {serviceWorker: true};
    return null;
}

/**
 * Extract info from a favorite.
 * @param {Object} requestDetails
 * @returns {Object} - the favorite info extracted into an object
 */
function extractTwitterFavorite({requestDetails = null,
                                 details = null, verified = null,
                                 platform = null, eventType = null,
                                 blockingType = null, eventTime = null}) {
    var tweetId = requestDetails.requestBody.formData.id[0];
    details.eventType = "favorite";
    details.eventTimestamp = requestDetails.timeStamp;
    details.favoritedId = tweetId;
    details.eventTime = eventTime;
    return details;
}

/**
 * Request the content of a tweet, then filter and deduplicate the urls and return the relevant ones.
 * @param {string} tweet_id - the numerical ID of the tweet to retrieve
 * @returns - see Twitter API
 */
export function getTweetContent(tweetId) {
    return new Promise((resolve, reject) => {
        if (twitter_tabid < 0) { reject(); return; }
        browser.tabs.sendMessage(twitter_tabid,
            { tweetId: tweetId, x_csrf_token: twitter_x_csrf_token,
                authorization: twitter_authorization}).then((response) => {
                    try {
                        resolve(response.globalObjects.tweets);
                    } catch {resolve([]); }
                });
    });
}

/**
 * A content script within the page allows us to send fetch requests with the correct
 * cookies to get Twitter to respond. When the first Twitter tracker is registered,
 * register the content script and listen for it to tell us which tab ID it's inside.
 * We also need two additional fields to construct valid requests. To deal with these
 * changing periodically, we log them each time we see them sent.
 */
function tweetContentInit() {
    if (tweetContentSetUp) { return; }
    tweetContentSetUp = true;
    browser.contentScripts.register({
        matches: ["https://twitter.com/*", "https://twitter.com/"],
        js: [
            { file: "/WebScience/Measurements/content-scripts/twitter.js" }
        ],
        runAt: "document_idle"
    });
    browser.webRequest.onBeforeSendHeaders.addListener((details) => {
        for (var header of details.requestHeaders) {
            if (header.name == "x-csrf-token") {
                twitter_x_csrf_token = header.value;
            }
            if (details.tabId >= 0) {
                twitter_tabid = details.tabId;
            }
            if (header.name == "authorization") {
                twitter_authorization = header.value;
            }
        }
    }, {urls: ["https://api.twitter.com/*"]}, ["requestHeaders"]);
}

/**
 * A content script inside the page allows us to seach for a post or send a request.
 * When the first Facebook tracker is registered, register the content script
 * and listen for it to tell us which tab ID it's in.
 */
async function fbPostContentInit() {
    if (fbPostContentSetUp) { return; }
    fbPostContentSetUp = true;
    Messaging.registerListener("WebScience.Utilities.SocialMediaActivity",
        (message, sender) => {
            if (message.platform == "facebook") {
                facebookTabId = sender.tab.id;
            }
        });
    // Register the content script that will find posts inside the page when reshares happen
    await browser.contentScripts.register({
        matches: ["https://www.facebook.com/*", "https://www.facebook.com/"],
        js: [
            { file: "/WebScience/Measurements/content-scripts/facebook.js" }
        ],
        runAt: "document_start"
    });
}

/**
 * Parse a react request into an event.
 * @param requestDetails - the raw request
 * @returns - the parsed event
 */
function extractFacebookReact({requestDetails = null, eventTime = null, verified = null}) {
    var reactionRequest = verified.reactionRequest;
    var postId = "";
    var groupId = "";
    var ownerId = "";
    try {
        var tracking = findFieldFacebook(reactionRequest, "tracking");
        postId = findFieldFacebook(tracking, "top_level_post_id");
        groupId = findFieldFacebook(tracking, "group_id");
        ownerId = findFieldFacebook(tracking, "content_owner_id_new");
    } catch(error) {
        var feedbackId = findFieldFacebook(reactionRequest, "feedback_id");
        if (feedbackId.startsWith("feedback:")) {
            postId = feedbackId.substring(9);
        }
    }
    var reaction = findFieldFacebook(reactionRequest, "feedback_reaction");
    var reactionType = "unknown";
    if (reaction == 0) { // removing reaction
        reactionType = "remove";
    } else if (reaction == 1) {
        reactionType = "like";
    } else if (reaction == 2) {
        reactionType = "love";
    } else if (reaction == 16) {
        reactionType = "care";
    } else if (reaction == 4) {
        reactionType = "haha";
    } else if (reaction == 3) {
        reactionType = "wow";
    } else if (reaction == 7) {
        reactionType = "sad";
    } else if (reaction == 8) {
        reactionType = "angry";
    }
    var details = {eventType: "react", eventTime: eventTime,
        postId: postId, groupId: groupId,
        ownerId: ownerId, reactionType: reactionType};
    return details;
}

/**
 * Check that a request is a valid react request
 * @param requestDetails - the raw request
 * @returns - null if the request is not a valid react, empty object otherwise
 */
function verifyFacebookReact({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.fb_api_req_friendly_name)) { return null; }
    var friendlyName = findFieldFacebook(requestDetails, "fb_api_req_friendly_name");
    if (!(friendlyName.includes("UFI2FeedbackReactMutation") ||
          friendlyName.includes("CometUFIFeedbackReactMutation"))) {
        return null;
    }
    var reactionRequest = findFieldFacebook(requestDetails.requestBody.formData, "variables");
    return {reactionRequest};
}

/**
 * Check that a request is a valid post request
 * @param requestDetails - the raw request
 * @returns - null if the request is not a valid post, empty object otherwise
 */
function verifyFacebookPost({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.variables)) { return null; }
    if (requestDetails.url.includes("api/graphql")) {
        var friendlyName = findFieldFacebook(requestDetails.requestBody.formData, "fb_api_req_friendly_name");
        if (!(friendlyName.includes("ComposerStoryCreateMutation"))) { return null; }
    }
    if (isThisPostAReshare(requestDetails)) { return null; }
    return {};
}

/**
 * Parse a post request into an event.
 * @param requestDetails - the raw request
 * @returns - the parsed event
 */
function extractFacebookPost({requestDetails = null, eventTime = null}) {
    var postText = "";
    var postUrls = [];
    var audience = "unknown";
    var composerType = "unknown";
    var variables = findFieldFacebook(requestDetails.requestBody.formData, "variables", false);
    if (!Array.isArray(variables)) variables = [variables];
    for (var variable of variables) {
        var parsedVar;
        try {
            parsedVar = JSON.parse(variable);
        } catch {
            parsedVar = variable;
        }
        variable = parsedVar;
        composerType = findFieldFacebook(variable, "composer_type");

        // Check for urls in the post text itself
        var messageText = findFieldFacebook(findFieldFacebook(variable, "message"), "text");
        postText = postText.concat(messageText);
        var audience = checkFacebookPostAudience(requestDetails);

        // Check for urls that are attachments instead of post text
        var attachments = findFieldFacebook(variable, "attachments", false);
        if (!(Array.isArray(attachments))) attachments = [attachments];
        for (var attachment of attachments) {
            var url = findFieldFacebook(findFieldFacebook(attachment, "share_params"), "canonical");
            postUrls.push(url);
        }
    }
    var details = {postTime: eventTime, postText: postText, audience: audience,
        postUrls: postUrls, eventType: "post", eventTime: eventTime};
    return details;
}

/**
 * Parse a comment request into an event.
 * @param requestDetails - the raw request
 * @returns - the parsed event
 */
function extractFacebookComment({requestDetails = null, eventTime = null}) {
    var commentRequest = findFieldFacebook(requestDetails.requestBody.formData, "variables");
    var tracking = findFieldFacebook(variables, "tracking");
    var postId = "";
    var groupId = "";
    var ownerId = "";
    postId = findFieldFacebook(tracking, "top_level_post_id");
    groupId = findFieldFacebook(tracking, "group_id");
    ownerId = findFieldFacebook(tracking, "content_owner_id_new");
    var commentText = findFieldFacebook(findFieldFacebook(commentRequest, "message"), "text");
    var details = {
        eventType: "comment",
        postId: postId,
        groupId: groupId,
        ownerId: ownerId,
        eventTime: eventTime,
        commentText: commentText};
    return details;
}

/**
 * Check that a request is a valid comment request
 * @param requestDetails - the raw request
 * @returns - null if the request is not a valid comment, empty object otherwise
 */
function verifyFacebookComment({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.fb_api_req_friendly_name)) { return null; }
    var friendlyName = findFieldFacebook(requestDetails, "fb_api_req_friendly_name");
    if (!(friendlyName.includes("UFI2CreateCommentMutation"))) { return null; }

    return {};
}

function checkFacebookPostAudience(requestDetails) {
    var base_state = "unknown";
    var audience = "unknown";

    if (!(requestDetails && requestDetails.requestBody &&
        requestDetails.requestBody.formData.fb_api_req_friendly_name)) { return audience; }

    var variables = findFieldFacebook(requestDetails.requestBody.formData, "variables");
    var friendlyName = findFieldFacebook(requestDetails.requestBody.formData,
                                         "fb_api_req_friendly_name");
    if (friendlyName.includes("ComposerStoryCreateMutation")) {
        // this is a "post"-type event
        var base_state =
            findFieldFacebook(
                findFieldFacebook(
                    findFieldFacebook(variables, "audience"),
                    "privacy"),
                "base_state");
    }

    if (friendlyName.includes("useCometFeedToFeedReshare_FeedToFeedMutation")) {
        // this is a "reshare"-type event

        base_state = findFieldFacebook(
            findFieldFacebook(
                findFieldFacebook(variables, "audiences"),
                "privacy"),
            "base_state");
    }

    if (base_state.toLowerCase() == "friends" ||
        base_state.toLowerCase() == "self") {
        audience = "restricted";
    } else if (base_state.toLowerCase() == "everyone") {
        audience = "public";
    }
    return audience;
}

function findFieldFacebook(object, fieldName, enterArray = true, recurseLevel = 5) {
    if (recurseLevel <= 0) return null;
    if (object == null) return null;
    // if we're lucky, the field is here -- might be an array type, though
    if (object.hasOwnProperty(fieldName)) {
        var result = null;
        if (enterArray && Array.isArray(object[fieldName])){
            result = object[fieldName][0];
        }
        result = object[fieldName];

        //nobody wants straight JSON back
        try {
            var parsed = JSON.parse(result)
            return parsed;
        } catch {
            return result;
        }
    }

    // maybe it's JSON?
    try {
        var parsed = JSON.parse(object);
        return findFieldFacebook(parsed, fieldName, enterArray, recurseLevel - 1);
    } catch {
    }

    // if that fails, start checking children
    for (var subObject in object) {
        var result = findFieldFacebook(object[subObject], fieldName, enterArray, recurseLevel - 1);
        if (result != null) return result;
    }

    // not today.
    return null;
}


/**
 * Parse a reshare request into an event.
 * @param requestDetails - the raw request
 * @returns - the parsed event
 */
async function extractFacebookReshare({requestDetails = null, verified = null, eventTime = null}) {
    // New FB
    if (requestDetails.url.includes("api/graphql")) {
        var details = {};
        var composerType = "unknown";
        var variables = findFieldFacebook(requestDetails.requestBody.formData, "variables");
        composerType = findFieldFacebook(variables, "composerType");
        var message = findFieldFacebook(variables, "message");
        details.newPostMessage = message ? findFieldFacebook(message, "text") : "";
        details.attachedUrls = [];
        try {
            var attachments = findFieldFacebook(variables, "attachments");
            var link = findFieldFacebook(attachments, "link");
            var canonical = findFieldFacebook(link, "canonical");
            details.attachedUrls.push(canonical);
        } catch { }
        var audience = checkFacebookPostAudience(requestDetails);
        var source = await getReshareInfo();
        details.audience = audience;
        details.source = source;
        details.eventType = "reshare";
        details.eventTime = eventTime;
        return details;
    }
}

async function getReshareInfo() {
    return browser.tabs.sendMessage(facebookTabId, {"recentReshare": true}).then((response) => {
        return response;
    }, (e) => { console.log("ERROR", e); } );
}

function isThisPostAReshare(requestDetails) {
    var friendlyName = findFieldFacebook(requestDetails.requestBody.formData,
        "fb_api_req_friendly_name");
    if (friendlyName.includes( "ComposerStoryCreateMutation")) {
        // sometimes things that look like posts are secretly reshares
        var composerType = findFieldFacebook(requestDetails.requestBody.formData,
            "composer_type");
        if (composerType == "share") {
            return true;
        }
        return false;
    }
    return false;
}

/**
 * Check that a request is a valid reshare request
 * @param requestDetails - the raw request
 * @returns - null if the request is not a valid reshare, empty object otherwise
 */
function verifyFacebookReshare({requestDetails = null }) {
    if (requestDetails.url.includes("api/graphql")) {
        if (!(requestDetails.requestBody.formData.fb_api_req_friendly_name)) {
            return null;
        }
        if (requestDetails.requestBody.formData.fb_api_req_friendly_name.includes(
            "useCometFeedToFeedReshare_FeedToFeedMutation")) {
            return {};
        }
        if (isThisPostAReshare(requestDetails)) {
            return {};
        }
        return null;
    }
    var sharedFromPostId = null // the ID of the original post that's being shared
    var ownerId = null; // we need this if the main method of getting the contents doesn't work
    var newPostMessage = null // any content the user adds when sharing
    if (requestDetails.requestBody.formData &&
        "shared_from_post_id" in requestDetails.requestBody.formData &&
        requestDetails.requestBody.formData.shared_from_post_id.length > 0 &&
        "sharer_id" in requestDetails.requestBody.formData &&
        requestDetails.requestBody.formData.sharer_id.length > 0) {
        sharedFromPostId = requestDetails.requestBody.formData.shared_from_post_id[0];
        ownerId = requestDetails.requestBody.formData.sharer_id[0];
        return {sharedFromPostId: sharedFromPostId, ownerId: ownerId};
    }
    else {
        var parsedUrl = new URL(requestDetails.url);
        if (parsedUrl.searchParams.has("shared_from_post_id")) {
            sharedFromPostId = parsedUrl.searchParams.get("shared_from_post_id");
        }
        if (parsedUrl.searchParams.has("owner_id")) {
            ownerId = parsedUrl.searchParams.get("owner_id");
        }
        if (parsedUrl.searchParams.has("message")) {
            newPostMessage = parsedUrl.searchParams.get("message");
        }
        if (sharedFromPostId || ownerId || newPostMessage) {
            return {sharedFromPostId: sharedFromPostId,
                    ownerId: ownerId, newPostMessage: newPostMessage};
        }
    }
    return null;
}

/**
 * Get the contents and attachments of a Facebook post.
 * @param postId - the unique ID of the post
 * @param ownerId - the unique ID of the owner, or of the group, if the post is in a group
 */
export function getFacebookPostContents(postId) {
    return new Promise((resolve, reject) => {
        if (facebookTabId >= 0) {
            browser.tabs.sendMessage(facebookTabId, {"postId": postId}).then((response) => {
                resolve(response);
                return;
            }, (e) => { console.log("ERROR", e); } );
        } else reject();
    });
}

/**
 * Reddit posts don't currently have validation needs.
 */
function verifyRedditPost({requestDetails = null}) {
    return {};
}

/**
 * Parse a Reddit post request into an object.
 * @param requestDetails - the raw request
 * @returns - the parsed object
 */
function extractRedditPost({requestDetails = null}) {
    var shareTime = Date.now();
    var details = {};
    details.eventTime = shareTime;
    details.postBody = [];
    details.attachment = "";
    details.subredditName = "";

    var subredditName = "";
    if ("submit_type" in requestDetails.requestBody.formData &&
        requestDetails.requestBody.formData.submit_type.length > 0 &&
        requestDetails.requestBody.formData.submit_type[0] == "subreddit" &&
        "sr" in requestDetails.requestBody.formData &&
        requestDetails.requestBody.formData.sr.length > 0) {
        subredditName = requestDetails.requestBody.formData.sr[0];
        details.subredditName = subredditName;
    }

    // Handle if there's a URL attached to the post
    if (("url" in requestDetails.requestBody.formData) &&
        (requestDetails.requestBody.formData["url"].length == 1)) {
        var postUrl = requestDetails.requestBody.formData["url"][0];
        details.attachment = postUrl;
    }

    details.postTitle = requestDetails.requestBody.formData.title[0];
    details.eventType = "post";

    /* check that this is a post whose body we can read */
    /* Reddit breaks up what the user types in the post. The "c" element of
     *  the "document" array is another array of objects with "e" and "t" attributes.
     * The "e" attribute tells you the type of element it is ("text" or "link"),
     *  and then the "t" attribute is the actual content. So, a post with the content:
     *  Here are some words www.example.com more words
     *  would generate a document[0].c with three elements:
     *  {"e":"text", "t":"Here are some words "}
     *  {"e":"link", "t":"www.example.com"}
     *  {"e":"text", "t":" more words"}
     *  (sometimes there are more attributes besides e and t -- but those are the ones that seem relevant)
     */
    if ("richtext_json" in requestDetails.requestBody.formData) {
        var postObject = JSON.parse(requestDetails.requestBody.formData["richtext_json"]);
        if ("document" in postObject) {
            details.postBody = [];
            for (var paragraph of postObject.document) {
                if ("c" in paragraph) {
                    details.postBody.push(paragraph.c);
                }
            }
        }
    }
    return details;
}

/**
 * Check that a request is a valid Reddit comment
 * @param requestDetails - the raw request
 * @returns - null if the request is not valid, empty object otherwise
 */
function verifyRedditComment({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.thing_id &&
        (requestDetails.requestBody.formData.richtext_json ||
           requestDetails.requestBody.formData.text))) { return null; }
    return {};
}

/**
 * Parse a Reddit comment request into an object.
 * @param requestDetails - the raw request
 * @returns - the parsed object
 */
function extractRedditComment({requestDetails = null, eventTime = null}) {
    var details = {};
    details.eventTime = eventTime;
    details.eventType = "comment";
    details.postId = requestDetails.requestBody.formData.thing_id;
    details.commentText = requestDetails.requestBody.formData.richtext_json;
    details.otherCommentText = requestDetails.requestBody.formData.text;
    return details;
}

/**
 * Check that a request is a valid Reddit post vote
 * @param requestDetails - the raw request
 * @returns - null if the request is not valid, empty object otherwise
 */
function verifyRedditPostVote({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.id &&
          requestDetails.requestBody.formData.id.length > 0 &&
          requestDetails.requestBody.formData.dir &&
          requestDetails.requestBody.formData.dir.length > 0 &&
          requestDetails.requestBody.formData.id[0].startsWith("t3_"))) {return null; }
    return {};
}

/**
 * Parse a Reddit post vote request into an object.
 * @param requestDetails - the raw request
 * @returns - the parsed object
 */
function extractRedditPostVote({requestDetails = null, eventTime = null}) {
    var details = {};
    details.eventTime = eventTime;
    details.eventType = "postVote";
    details.vote = requestDetails.requestBody.formData.dir[0];
    details.postId = requestDetails.requestBody.formData.id[0];
    return details;
}

/**
 * Check that a request is a valid Reddit comment vote
 * @param requestDetails - the raw request
 * @returns - null if the request is not valid, empty object otherwise
 */
function verifyRedditCommentVote({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.id &&
          requestDetails.requestBody.formData.id.length > 0 &&
          requestDetails.requestBody.formData.dir &&
          requestDetails.requestBody.formData.dir.length > 0 &&
          requestDetails.requestBody.formData.id[0].startsWith("t1_"))) {return null; }
    return {};
}

/**
 * Parse a Reddit comment vote request into an object.
 * @param requestDetails - the raw request
 * @returns - the parsed object
 */
function extractRedditCommentVote({requestDetails = null, eventTime = null}) {
    return new Promise(async (resolve, reject) => {
        var details = {};
        details.eventTime = eventTime;
        details.eventType = "commentVote";
        details.vote = requestDetails.requestBody.formData.dir[0];
        details.commentId = requestDetails.requestBody.formData.id[0];

        var hydratedComment = await getRedditThingContents(details.commentId);
        details.postId = hydratedComment.data.children[0].data.link_id;
        details.commentContents = hydratedComment;
        resolve(details);
    });
}

export function checkSubredditStatus(subredditName) {
    if (subredditName == "") return "unknown";
    return new Promise((resolve, reject) => {
        fetch(`https://www.reddit.com/r/${subredditName}/about.json`).then(responseFF => {
            responseFF.text().then(response => {
                var subredditInfo = JSON.parse(response);
                if ("error" in subredditInfo && subredditInfo.error == 403 &&
                    "reason" in subredditInfo && subredditInfo.reason == "private") {
                    resolve("private");
                    return;
                }
                if ("data" in subredditInfo && "subreddit_type" in subredditInfo.data) {
                    resolve(subredditInfo.data.subreddit_type);
                    return;
                }
                resolve("unknown");
            });
        });
    });
}

/**
 * Retrieve a reddit comment or post ("thing" is the official Reddit term)
 * @param thingId - the unique ID of the post or comment, with identifier ("t1_" or "t3_")
 * @returns - see Reddit API
 */
export function getRedditThingContents(thingId) {
    return new Promise((resolve, reject) => {
        var reqString = `https://www.reddit.com/api/info.json?id=${thingId}`;
        fetch(reqString).then((responseFF) => {
            responseFF.text().then((response) => {
                resolve(JSON.parse(response))
            });
        });
    });
}
