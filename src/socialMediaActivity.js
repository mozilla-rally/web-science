/**
 * This module provides utility functions for tracking social media posts.
 *
 * @module socialMediaActivity
 */
import * as events from "./events.js";

import * as debugging from "./debugging.js";
import * as messaging from "./messaging.js";
import * as permissions from "./permissions.js";
import * as timing from "./timing.js";
import facebookContentScript from "include:./content-scripts/socialMediaActivity.facebook.content.js";
import twitterContentScript from "include:./content-scripts/socialMediaActivity.twitter.content.js";

permissions.check({
    module: "webScience.socialMediaActivity",
    requiredPermissions: [ "webRequest" ],
    requiredOrigins: [
        "*://*.facebook.com/*",
        "*://*.twitter.com/*",
        "*://*.reddit.com/*"
    ],
    suggestedPermissions: [ "unlimitedStorage" ]
});

/**
 * @constant {debugging.debuggingLogger}
 * @private
 */
const debugLog = debugging.getDebuggingLog("socialMediaActivity");

/**
 * Whether the module should run in private browsing windows.
 * @type {boolean}
 * @private
 */
let privateWindows = false;

/**
 * Whether the Twitter content script has been registered.
 * @type {boolean}
 * @private
 */
let tweetContentSetUp = false;
/**
 * Getting tweet contents requires sending the right authorization. The
 *  following values are parsed from observed requests and stored for future use.
 * @private
 */
let twitter_x_csrf_token = "";
let twitter_authorization = "";
let twitter_tabid = "";


/**
 * Whether the Facebook content script has been registered.
 * @type {boolean}
 * @private
 */
let fbPostContentSetUp = false;
/**
 * Similarly, getting Facebook post contents requires messaging the content script
 *  on the page, so we store the tab ID of the most recent Facebook access.
 */
let facebookTabId = -1;

/**
 * Keeps track of which request IDs have been seen and processed, to avoid
 *  double-counting on redirects.
 * @type {Set<string>}
 * @private
 */
const processedRequestIds = new Set();


/**
 * An object providing details about an event on Twitter.
 * @typedef {Object} twitterActivityDetails
 * @property {string} eventType - action taken by user ("tweet", "retweet", or "favorite").
 * @property {number} eventTime - timestamp of user action.
 * @property {string} tweetText - for a tweet, the content of the tweet.
 * @property {string[]} tweetAttachments - for a tweet, any links attached to the tweet.
 * @property {string} sharedId - for a favorite or share, the Twitter ID of the favorited or retweeted tweet.
 */

/**
 * An object providing details about an event on Facebook.
 * @typedef {Object} facebookActivityDetails
 * @property {string} eventType - action taken by user ("post", "reshare", or "react").
 * @property {number} eventTime - timestamp of user action.
 * @property {string} postText - for a post or reshare, the content of the post.
 * @property {string[]} postAttachments - for a post or reshare, any links attached to the post.
 * @property {string} postAudience - for a post or reshare, whether the post is visible to all ("public") or not ("restricted").
 * @property {string} actedUponPostId - for a reshare, comment or react, unique ID for the post commented on or reacted to.
 * @property {string} actedUponGroupId - for a comment or react on a post from a group, the ID for the group.
 * @property {string} actedUponOwnerId - for a comment or react on a post not from a group, the ID for the post's owner.
 * @property {string} reactType - for a react, which emoji reaction was used ("remove", "like", "love", "care", "haha", "wow", "sad", "angry").
 * @property {string} commentText - for a comment, the contents of the comment.
 * @property {string} reshareSource - for a reshare, whether the reshared post came from a person or page.
 */

/**
 * An object providing details about an event on Reddit.
 * @typedef {Object} redditActivityDetails
 * @property {string} eventType - action taken by user ("post", "comment", "postVote", or "commentVote").
 * @property {number} eventTime - timestamp of user action.
 * @property {string} postText - for a post, the plaintext post contents.
 * @property {string[]} postAttachments - for a post, any links attached.
 * @property {string} subredditName - for a post, the name of the subreddit in which it was posted.
 * @property {string} postTitle - for a post, the title of the post.
 * @property {string} voteDirection - for a post or comment vote, the direction of the vote (-1, 0, 1).
 * @property {string} votedCommentId - for a comment vote, the Reddit thing ID of the voted-upon comment.
 * @property {string[]} commentAttachments - for a comment, any links attached to the comment.
 * @property {string} commentText - for a comment, the contents of the comment.
 * @property {string} commentedPostId - for a comment, the Reddit thing ID of the commented-upon post.
 * @property {string} votedPostId - for a post vote, the Reddit thing ID of the voted-upon post.
 */

/**
 * A callback function for Facebook activity events.
 * @callback facebookActivityCallback
 * @param {facebookActivityDetails} details - Additional information about the Facebook activity event.
 */

/**
 * A callback function for Twitter activity events.
 * @callback twitterActivityCallback
 * @param {twitterActivityDetails} details - Additional information about the Twitter activity event.
 */

/**
 * A callback function for Reddit activity events.
 * @callback redditActivityCallback
 * @param {redditActivityDetails} details - Additional information about the Reddit activity event.
 */

/**
 * Options when adding a Facebook activity event listener.
 * @typedef {Object} facebookActivityOptions
 * @property {string[]} eventTypes - The events on Facebook to notify for: "post", "comment", "react", or "reshare".
 * @property {boolean} blocking - Optional, set to true to allow blocking the events.
 */

/**
 * Options when adding a Twitter activity event listener.
 * @typedef {Object} twitterActivityOptions
 * @property {string[]} eventTypes - The events on Twitter to notify for: "tweet", "retweet", "favorite".
 * @property {boolean} blocking - Optional, set to true to allow blocking the events.
 */

/**
 * Options when adding a Reddit activity event listener.
 * @typedef {Object} redditActivityOptions
 * @property {string[]} eventTypes - The events on Reddit to notify for: "post", "comment", "postVote", "commentVote".
 * @property {boolean} blocking - Optional, set to true to allow blocking the events.
 */

/**
 * @type {events.event<twitterActivityCallback, twitterActivityOptions}
 */
export const onTwitterActivity = events.createEvent({
    addListenerCallback: addListenerTwitter,
    notifyListenersCallback: notifyFilter
});

/**
 * @type {events.event<facebookActivityCallback, facebookActivityOptions}
 */
export const onFacebookActivity = events.createEvent({
    addListenerCallback: addListenerFacebook,
    notifyListenersCallback: notifyFilter
});

/**
 * @type {events.event<redditActivityCallback, redditActivityOptions}
 */
export const onRedditActivity = events.createEvent({
    addListenerCallback: addListenerReddit,
    notifyListenersCallback: notifyFilter
});

/**
 * Configure listeners to run in private windows.
 */
export function enablePrivateWindows() {
    privateWindows = true;
}


/**
 * Unregister old handlers for an activity, and register a new one, if necessary.
 * Unregistering is only necessary when there's already a nonblocking handler registered
 * and we want to convert it to a blocking handler.
 * @param platform - which social media platform the activity is for
 * @param eventType - which type of activity we're registering
 * @param blockingType - whether the handler should be blocking or not
 * @private
 */
function registerPlatformListener(platform, eventType, blockingType) {
    const blocking = blockingType == "blocking";
    const handler = platformHandlers[platform][eventType];

    if (handler.registeredListener == null ||
        (blockingType == "blocking" && handler.registeredBlockingType != "blocking")) {

        // if there is a nonblocking listener registered, we must be blocking (otherwise this code wouldn't run)
        // and if we're adding a blocking listener, we want to get rid of the nonblocking one
        if (handler.registeredListener != null && handler.registeredBlockingType == "nonblocking") {
            browser.webRequest[handler.stage].removeListener(handler.registeredListener);
        }
        const stage = handler.stage;
        const urls = handler.urls;
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
}

/**
 * Handle registering listeners and setting up content scripts for a new set of events.
 * Used as callback for adding a listener to an event.
 * @param {twitterActivityCallback|facebookActivityCallback|redditActivityCallback} listener -
 *  The listener being added.
 * @param {string} platform - the social media platform for the events.
 * @param {Array<string>} eventTypes - a list of events on the above platform.
 * @param {boolean} blocking - whether the listener should be able to cancel an event.
 * @private
 */
function addListener(listener, options, platform){
    options.platform = platform;
    for (const eventType of options.eventTypes) {
        registerPlatformListener(platform, eventType, options.blocking ? "blocking" : "nonblocking");
    }
    if (platform === "twitter") tweetContentInit();
    if (platform === "facebook") fbPostContentInit();
}

/**
 * Add a listener for Twitter events. See addListener for more.
 * @private
 */
function addListenerTwitter(listener, options) {
    addListener(listener, options, "twitter");
}
/**
 * Add a listener for Facebook events. See addListener for more.
 * @private
 */
function addListenerFacebook(listener, options) {
    addListener(listener, options, "facebook");
}
/**
 * Add a listener for Reddit events. See addListener for more.
 * @private
 */
function addListenerReddit(listener, options) {
    addListener(listener, options, "reddit");
}

/**
 * Filter generated events to only the listeners for the specific event type.
 * @param {twitterActivityCallback|facebookActivityCallback|redditActivityCallback} listener -
 *  The listener that may be notified.
 * @param {Array<facebookActivityDetails|twitterActivityDetails|redditActivityDetails>}
 *   listenerArguments - The event about to be sent to the listener.
 * @param {EventOptions} options - The set of options provided when this listener was registered.
 * @returns {boolean} Whether to notify this listener for this event.
 * @private
 */
function notifyFilter(listener, listenerArguments, options) {
    const reportedEvent = listenerArguments[0];
    const ret = reportedEvent["platform"] === options["platform"] &&
        options["eventTypes"].includes(reportedEvent["eventType"]);
    return ret;
}

/**
 * Upon receiving any event, validate that it is a valid instance of the tracked action,
 * call parsers to extract relevant information, and call a blocking callback if it exists.
 * If the blocking callback cancels the event by returning an object containing a "cancel"
 * property, cancel the request. Otherwise, let the request continue. If there is not a
 * blocking listener or it lets the event continue, call the nonblocking listeners.
 * @param {Object} requestDetails - the raw request event from WebRequests
 * @param {string} platform - which social media platform this event is from
 * @param {string} eventType - which event this request should be
 * @param {string} blockingType - whether a blocking listener should run
 * @private
 */
async function handleGenericEvent({requestDetails = null,
                             platform = null, eventType = null,
                             blockingType = null}) {
    const handler = platformHandlers[platform][eventType];
    const eventTime = timing.now();
    let verified = null;
    for (const verifier of handler.verifiers) {
        verified = await verifier({requestDetails: requestDetails, platform: platform,
            eventType: eventType, blockingType: blockingType,
            eventTime: eventTime});
        if (!verified) {
            return {};
        }
    }
    if (platform == "facebook") {
        facebookTabId = requestDetails.tabId;
    }
    let details = {};
    for (const extractor of handler.extractors) {
        details = await extractor({requestDetails: requestDetails, details: details,
            verified: verified, platform: platform, eventType: eventType,
            blockingType: blockingType, eventTime: eventTime});
        if (!details) {
            return {};
        }
    }
    details['platform'] = platform;
    const eventListener = platform == "twitter" ? onTwitterActivity :
                          platform == "facebook" ? onFacebookActivity:
                          onRedditActivity;
    const blockingResults = eventListener.notifyListeners([details]);
    for (const blockingResult of blockingResults) {
        if ("cancel" in blockingResult) {
            return blockingResult;
        }
    }
    for (const completer of handler.completers) {
        completer({requestDetails: requestDetails, verified: verified, details: details,
            platform: platform, eventType: eventType, blockingType: blockingType});
    }
}

/**
 * A generic verifier that makes sure a request is a POST.
 * @param {Object} requestDetails - the raw request
 * @returns {Object} - empty object if verified, null otherwise.
 * @private
 */
function verifyPostReq({requestDetails = null}) {
    if (!requestDetails) return null;
    if (!requestDetails.method == "POST") return null;
    return {};
}

/**
 * A generic verifier that makes sure the formData field is present.
 * @param {Object} requestDetails - the raw request
 * @returns {Object} - empty object if verified, null otherwise.
 * @private
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
 * request contents, this verifier must be the LAST in the list.
 * @param {Object} requestDetails - the raw request
 * @returns {Object} - empty object if verified, null otherwise.
 * @private
 */
function verifyNewRequest({requestDetails = null}) {
    if (!requestDetails.requestId) return null;
    if (processedRequestIds.has(requestDetails.requestId)) {
        return null;
    }
    processedRequestIds.add(requestDetails.requestId);
    return {};
}

/**
 * The code for monitoring for requests to API endpoints, then extracting information
 *  from the network requests works as follows:
 * - For each event-platform pairing, there is a set of URLs to watch. There may be multiple
 *    endpoints for an event when the platform sends different kinds of requests for the same
 *    event, or when there are multiple versions of the platform (e.g., Reddit currently runs
 *    "new Reddit" and "old Reddit", which, in addition to being visually different, use
 *    separate API endpoints.
 * - When a request arrives at one of the endpoints, it goes through a series of checks
 *    to determine whether it is actually an event of the desired type. For example,
 *    Facebook uses the same API endpoint for a wide variety of events, so the actual event
 *    can only be determined by looking at variables inside the request itself. These checks
 *    are called verifiers, and are listed in order for each event-platform pairing.
 * - Once a request is verified, it goes through the given event-platform pairing's
 *    extractors, which parse it into a usable and consistent form and notify the
 *    listeners.
 * - Finally, event-platform pairings can declare functions that should run after the
 *    above processes, to complete any cleanup tasks.
 */

/**
 * Holds the configuration for each type of handler.
 * @private
 */
const platformHandlers = {
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
    urls: [
        "https://twitter.com/intent/tweet",
        "https://api.twitter.com/*/statuses/update.json",
        "https://twitter.com/i/api/*/statuses/update.json"
    ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyTwitterTweet, verifyNewRequest],
    extractors: [extractTwitterTweet],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.twitter.retweet = {
    stage: "onBeforeRequest",
    urls: [
        "https://api.twitter.com/*/statuses/retweet.json",
        "https://twitter.com/i/api/*/statuses/retweet.json"
    ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyTwitterRetweet, verifyNewRequest],
    extractors: [extractTwitterRetweet],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.twitter.favorite = {
    stage: "onBeforeRequest",
    urls: [
        "https://api.twitter.com/*/favorites/create.json",
        "https://twitter.com/i/api/*/favorites/create.json"
    ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyTwitterFavorite, verifyNewRequest],
    extractors: [extractTwitterFavorite],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};

platformHandlers.facebook.post = {
    stage: "onBeforeRequest",
    urls: [ "https://www.facebook.com/api/graphql/" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyFacebookPost, verifyNewRequest],
    extractors: [extractFacebookPost],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.facebook.react = {
    stage: "onBeforeRequest",
    urls: [ "https://www.facebook.com/api/graphql/" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyFacebookReact, verifyNewRequest],
    extractors: [extractFacebookReact],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.facebook.comment = {
    stage: "onBeforeRequest",
    urls: ["https://www.facebook.com/api/graphql/"],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyFacebookComment, verifyNewRequest],
    extractors: [extractFacebookComment],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.facebook.reshare = {
    stage: "onBeforeRequest",
    urls: [ "https://www.facebook.com/api/graphql/" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyFacebookReshare, verifyNewRequest],
    extractors: [extractFacebookReshare],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};

platformHandlers.reddit.post = {
    stage: "onBeforeRequest",
    urls: [ "https://oauth.reddit.com/api/submit*", "https://old.reddit.com/api/submit*" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyRedditPost, verifyNewRequest],
    extractors: [extractRedditPost],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.reddit.comment = {
    stage: "onBeforeRequest",
    urls: [ "https://oauth.reddit.com/api/comment*", "https://old.reddit.com/api/comment*" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyRedditComment, verifyNewRequest],
    extractors: [extractRedditComment],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.reddit.postVote = {
    stage: "onBeforeRequest",
    urls: [ "https://oauth.reddit.com/api/vote*", "https://old.reddit.com/api/vote*" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyRedditPostVote, verifyNewRequest],
    extractors: [extractRedditPostVote],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};
platformHandlers.reddit.commentVote = {
    stage: "onBeforeRequest",
    urls: [ "https://oauth.reddit.com/api/vote*", "https://old.reddit.com/api/vote*" ],
    verifiers: [verifyPostReq, verifyReadableFormData, verifyRedditCommentVote, verifyNewRequest],
    extractors: [extractRedditCommentVote],
    completers: [],
    registeredListener: null,
    registeredBlockingType: null
};

/**
 * Ensure that a tweet request contains a readable tweet.
 * @param {Object} requestDetails - the raw request
 * @returns - null when invalid, otherwise an object indicating whether the request comes from
 *  a service worker (not currently used).
 * @private
 */
function verifyTwitterTweet({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.status)) return null;
    if (!(requestDetails.requestBody.formData.status.length > 0)) return null;
    if (requestDetails.tabId >= 0) return {serviceWorker: false};
    if (requestDetails.documentUrl.endsWith("sw.js")) return {serviceWorker: true};
    else { return null; }
}

/**
 * Return a twitterActivityDetails object with all fields initialized to default values.
 * @returns {twitterActivityDetails} - default-value Twitter details.
 */
function createBaseTwitterObject() {
    return {eventType: "", eventTime: 0, tweetText: null, tweetAttachments: null, sharedId: null};
}

/**
 * Extract info from a tweet.
 * @param {Object} requestDetails
 * @returns {twitterActivityDetails} - the tweet info extracted into an object
 * @private
 */
function extractTwitterTweet({requestDetails = null}) {
    const details = createBaseTwitterObject();
    details.eventType = "tweet";
    details.eventTime = requestDetails.timeStamp;
    const tweetText = requestDetails.requestBody.formData["status"][0];
    details.tweetText = tweetText;
    if (requestDetails.requestBody.formData.attachment_url &&
        requestDetails.requestBody.formData.attachment_url.length > 0) {
        details.tweetAttachments = requestDetails.requestBody.formData.attachment_url;
    }
    return details;
}

/**
 * Ensure that a retweet request contains a readable retweet.
 * @param {Object} requestDetails - the raw request
 * @returns - null when invalid, otherwise an object indicating whether the request comes from
 *  a service worker (not currently used).
 * @private
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
 * @returns {twitterActivityDetails} - the retweet info extracted into an object
 * @private
 */
function extractTwitterRetweet({requestDetails = null, eventTime = null}) {
    const details = createBaseTwitterObject();
    const tweetId = requestDetails.requestBody.formData.id[0];
    details.eventType = "retweet";
    details.eventTime = eventTime;
    details.sharedId = tweetId;
    return details;
}

/**
 * Ensure that a favorite request contains a readable favorite.
 * @param {Object} requestDetails - the raw request
 * @returns - null when invalid, otherwise an object indicating whether the request comes from
 *  a service worker (not currently used).
 * @private
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
 * @returns {twitterActivityDetails} - the favorite info extracted into an object
 * @private
 */
function extractTwitterFavorite({requestDetails = null, eventTime = null}) {
    const details = createBaseTwitterObject();
    const tweetId = requestDetails.requestBody.formData.id[0];
    details.eventType = "favorite";
    details.sharedId = tweetId;
    details.eventTime = eventTime;
    return details;
}

/**
 * An object representing the contents of a tweet as returned by Twitter.
 * @typedef tweetContentDetails
 * @param {string} tweetText - the plain text of the tweet.
 * @param {string[]} tweetAttachments - any URLs attached to the tweet.
 * @param {string} quotedId - if this is a quote tweet, the ID of the quoted tweet.
 * @param {string} retweetedId - if this is a retweet, the ID of the retweeted tweet.
 */

/**
 * Request the content of a tweet.
 * @param {string} tweet_id - the numerical ID of the tweet to retrieve
 * @returns {tweetContentDetails} - the tweet's parsed content.
 */
export function getTweetContent(tweetId) {
    return new Promise((resolve, reject) => {
        if (twitter_tabid < 0) { reject(); return; }
        browser.tabs.sendMessage(twitter_tabid,
            { tweetId: tweetId, x_csrf_token: twitter_x_csrf_token,
                authorization: twitter_authorization}).then((response) => {
                    try {
                        const allTweetContent = response.globalObjects.tweets[tweetId];
                        const tweetContent = {
                            tweetText: "",
                            tweetAttachments: [],
                            quotedId: "",
                            retweetedId: ""
                        };
                        if ("full_text" in allTweetContent) {
                            tweetContent.tweetText = allTweetContent.full_text;
                        }
                        if ("entities" in allTweetContent &&
                            "urls" in allTweetContent.entities) {
                            for (const url of allTweetContent.entities.urls) {
                                if ("expanded_url" in url) {
                                    tweetContent.tweetAttachments.push(url.expanded_url);
                                } else if ("url" in url) {
                                    tweetContent.tweetAttachments.push(url.url);
                                }
                            }
                        }
                        if ("quoted_status_id_str" in allTweetContent) {
                            tweetContent.quotedId = allTweetContent.quoted_status_id_str;
                        }
                        if ("retweeted_status_id_str" in allTweetContent) {
                            tweetContent.retweetedId = allTweetContent.retweeted_status_id_str;
                        }

                        resolve(tweetContent);
                    } catch {resolve(null); }
                });
    });
}

/**
 * A content script within the page allows us to send fetch requests with the correct
 * cookies to get Twitter to respond. When the first Twitter tracker is registered,
 * register the content script and listen for it to tell us which tab ID it's inside.
 * We also need two additional fields to construct valid requests. To deal with these
 * changing periodically, we log them each time we see them sent.
 * @private
 */
function tweetContentInit() {
    if (tweetContentSetUp) { return; }
    tweetContentSetUp = true;
    browser.contentScripts.register({
        matches: ["https://twitter.com/*", "https://twitter.com/"],
        js: [{
            file: twitterContentScript
        }],
        runAt: "document_idle"
    });
    browser.webRequest.onBeforeSendHeaders.addListener((details) => {
        for (const header of details.requestHeaders) {
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
 * @private
 */
async function fbPostContentInit() {
    if (fbPostContentSetUp) { return; }
    fbPostContentSetUp = true;
    messaging.onMessage.addListener(
        (message, sender) => {
            if (message.platform == "facebook") {
                facebookTabId = sender.tab.id;
            }
        }, { type: "webScience.socialMediaActivity" });
    // Register the content script that will find posts inside the page when reshares happen
    await browser.contentScripts.register({
        matches: ["https://www.facebook.com/*", "https://www.facebook.com/"],
        js: [{
            file: facebookContentScript
        }],
        runAt: "document_start"
    });
}

/**
 * Return a facebookActivityDetails object with all fields initialized to default values.
 * @returns {facebookActivityDetails} - default-value Facebook details.
 */
function createBaseFacebookObject() {
    return {
        eventType: "", eventTime: 0, postText: null, postAttachments: null,
        postAudience: null,

        actedUponPostId: null, actedUponGroupId: null, actedUponOwnerId: null, reactType: null,
        commentText: null, reshareSource: null

    };
}

/**
 * Parse a react request into an event.
 * @param {Object} requestDetails - the raw request
 * @returns {facebookActivityDetails} - the parsed event
 * @private
 */
function extractFacebookReact({requestDetails = null, eventTime = null}) {
    const details = createBaseFacebookObject();
    details.eventType = "react";
    details.eventTime = eventTime;
    const reactionRequest = findFieldFacebook(requestDetails.requestBody.formData, "variables");
    
    // For reacts, the post being reacted to is identified in a string like
    //  "feedback:postIDhere", which is then base-64 encoded. We find the encoded
    //  string and decode it, then parse to find the ID.
    const encodedFeedbackId = findFieldFacebook(reactionRequest, "feedback_id");
    const feedbackId = atob(encodedFeedbackId);
    if (feedbackId.startsWith("feedback:")) {
        details.postId = feedbackId.substring(9);
    }

    const reaction = findFieldFacebook(reactionRequest, "feedback_reaction");
    let reactionType = "unknown";
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
    details.reactType = reactionType;
    return details;
}

/**
 * Check that a request is a valid react request
 * @param {Object} requestDetails - the raw request
 * @returns {Object} - null if the request is not a valid react, empty object otherwise
 * @private
 */
function verifyFacebookReact({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.fb_api_req_friendly_name)) { return null; }
    const friendlyName = findFieldFacebook(requestDetails, "fb_api_req_friendly_name");
    if (!(friendlyName.includes("UFI2FeedbackReactMutation") ||
          friendlyName.includes("CometUFIFeedbackReactMutation"))) {
        return null;
    }
    return {};
}

/**
 * Check that a request is a valid post request
 * @param {Object} requestDetails - the raw request
 * @returns {Object} - null if the request is not a valid post, empty object otherwise
 * @private
 */
function verifyFacebookPost({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.variables)) { return null; }
    if (requestDetails.url.includes("api/graphql")) {
        const friendlyName = findFieldFacebook(requestDetails.requestBody.formData, "fb_api_req_friendly_name");
        if (!(friendlyName.includes("ComposerStoryCreateMutation"))) { return null; }
    }
    if (isThisPostAReshare(requestDetails)) { return null; }
    return {};
}

/**
 * Parse a post request into an event.
 * @param {Object} requestDetails - the raw request
 * @returns {facebookActivityDetails} - the parsed event
 * @private
 */
function extractFacebookPost({requestDetails = null, eventTime = null}) {
    const details = createBaseFacebookObject();
    details.postText = "";
    details.eventTime = eventTime;
    details.postAttachments = [];
    details.postAudience = checkFacebookPostAudience(requestDetails);
    let variables = findFieldFacebook(requestDetails.requestBody.formData, "variables", false);
    if (!Array.isArray(variables)) variables = [variables];
    for (let variable of variables) {
        let parsedVar;
        try {
            parsedVar = JSON.parse(variable);
        } catch {
            parsedVar = variable;
        }
        variable = parsedVar;

        // Check for urls in the post text itself
        const messageText = findFieldFacebook(findFieldFacebook(variable, "message"), "text");
        details.postText = details.postText.concat(messageText);

        // Check for urls that are attachments instead of post text
        let attachments = findFieldFacebook(variable, "attachments", false);
        if (!(Array.isArray(attachments))) attachments = [attachments];
        for (const attachment of attachments) {
            const url = findFieldFacebook(findFieldFacebook(attachment, "share_params"), "canonical");
            details.postAttachments.push(url);
        }
    }
    return details;
}

/**
 * Parse a comment request into an event.
 * @param {Object} requestDetails - the raw request
 * @returns {facebookActivityDetails} - the parsed event
 * @private
 */
function extractFacebookComment({requestDetails = null, eventTime = null}) {
    const details = createBaseFacebookObject();
    details.eventType = "comment";
    details.eventTime = eventTime;
    const variables = findFieldFacebook(requestDetails.requestBody.formData, "variables");
    const tracking = findFieldFacebook(variables, "tracking");
    details.actedUponPostId = findFieldFacebook(tracking, "top_level_post_id");
    details.actedUponGroupId = findFieldFacebook(tracking, "group_id");
    details.actedUponOwnerId = findFieldFacebook(tracking, "content_owner_id_new");
    details.commentText = findFieldFacebook(findFieldFacebook(variables, "message"), "text");
    return details;
}

/**
 * Check that a request is a valid comment request
 * @param {Object} requestDetails - the raw request
 * @returns {Object} - null if the request is not a valid comment, empty object otherwise
 * @private
 */
function verifyFacebookComment({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.fb_api_req_friendly_name)) { return null; }
    const friendlyName = findFieldFacebook(requestDetails, "fb_api_req_friendly_name");
    if (!(friendlyName.includes("UFI2CreateCommentMutation"))) { return null; }

    return {};
}

/**
 * Determine the audience of a Facebook post or reshare.
 * @param {Object} requestDetails - the full requestDetails object from a captured web request.
 * @return {string} - The audience of the post ("public", "restricted", or "unknown").
 * @private
 */
function checkFacebookPostAudience(requestDetails) {
    let base_state = "unknown";
    let audience = "unknown";

    if (!(requestDetails && requestDetails.requestBody &&
        requestDetails.requestBody.formData.fb_api_req_friendly_name)) { return audience; }

    const variables = findFieldFacebook(requestDetails.requestBody.formData, "variables");
    const friendlyName = findFieldFacebook(requestDetails.requestBody.formData,
                                         "fb_api_req_friendly_name");
    if (friendlyName.includes("ComposerStoryCreateMutation")) {
        // this is a "post"-type event
        base_state =
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

/**
 * Given an object and the name of a target attribute, attempt to find a field with that name
 *  within the object. This function is necessary to handle the frequest small changes that
 *  Facebook makes to its APIs. For example, they sometimes change a field from being a
 *  string to being an array of strings that only ever holds a single string, or vice versa.
 * The function recurses down the object structure, expanding fields as it goes:
 *   - it searches within arrays
 *   - it parses strings as JSON, since Facebook often encodes lower-level objects this way
 *   - it checks properties of the object itself
 * It also uses the first entry in an array as the return value.
 * Note that Facebook sometimes stores large integers in JSON. While Javascript
 *  recently added support for BigInts, the JSON parsing functions do not support it. If
 *  you run this function on an object that contains something that should be a BigInt,
 *  it will instead be parsed as a regular number, and therefore lose precision. Using
 *  a regular expression to parse that field of the object instead is a good idea.
 * @param {Object} object - The parent object to search.
 * @param {string} fieldName - The target field to find.
 * @param {boolean} enterArray - whether to use the first element of a found array as
 *  the return value, or the entire array.
 * @param {integer} recurseLevel - Used internally to prevent recursing down very large structures.
 * @param - the value of the fieldName, if found, or null.
 * @private
 */
function findFieldFacebook(object, fieldName, enterArray = true, recurseLevel = 5) {
    if (recurseLevel <= 0) return null;
    if (object == null) return null;
    // if we're lucky, the field is here -- might be an array type, though
    if (typeof(object) == "object" && fieldName in object) {
        let result = null;
        if (enterArray && Array.isArray(object[fieldName])){
            result = object[fieldName][0];
        }
        result = object[fieldName];

        //nobody wants straight JSON back
        try {
            const parsed = JSON.parse(result)
            return parsed;
        } catch {
            return result;
        }
    }

    // maybe it's JSON?
    try {
        const parsed = JSON.parse(object);
        return findFieldFacebook(parsed, fieldName, enterArray, recurseLevel - 1);
    } catch {
        debugLog("failed parsing facebook content as JSON");
    }

    // if that fails, start checking children
    if (typeof(object) == "object") {
        for (const subObject in object) {
            const result = findFieldFacebook(object[subObject], fieldName, enterArray, recurseLevel - 1);
            if (result != null) return result;
        }
    }

    // not today.
    return null;
}


/**
 * Parse a reshare request into an event.
 * @param {Object} requestDetails - the raw request
 * @returns {facebookActivityDetails} - the parsed event
 * @private
 */
async function extractFacebookReshare({requestDetails = null, verified = null, eventTime = null}) {
    if (requestDetails.url.includes("api/graphql")) {
        const details = createBaseFacebookObject();
        details.eventType = "reshare";
        details.eventTime = eventTime;
        details.postAudience = checkFacebookPostAudience(requestDetails);
        details.reshareSource = await getReshareInfo();
        const variables = findFieldFacebook(requestDetails.requestBody.formData, "variables");
        const message = findFieldFacebook(variables, "message");
        details.postText = message ? findFieldFacebook(message, "text") : "";
        details.postAttachments = [];
        try {
            const attachments = findFieldFacebook(variables, "attachments");
            const link = findFieldFacebook(attachments, "link");
            const canonical = findFieldFacebook(link, "canonical");
            if (canonical !== null) {
                details.postAttachments.push(canonical);
            }
            // Facebook's post IDs are extremely large integers, stored as such in JSON.
            // JSON doesn't support parsing such large values, and will instead round them
            // to close approximations (which of course fails to give us accurate values for
            // the post ID), so we use regexes to extract the relevant values without
            // JSON parsing the string.
            const shareData = link.share_scrape_data;
            const shareTypeRegex = /"share_type":(\d+)/;
            const shareParamsRegex = /"share_params":\[(\d+)\]/;
            const shareType = shareTypeRegex.exec(shareData);
            if (shareType != null && shareType.length == 2 && shareType[1] == "99") {
                const sharedPostId = shareParamsRegex.exec(shareData);
                if (sharedPostId != null && sharedPostId.length == 2) {
                    details.actedUponPostId = sharedPostId[1];
                }
            }
        } catch {
            debugLog("failed extracting links from facebook content");
        }
        return details;
    }
}

/**
 * Ask our Facebook content script whether the last reshare was from a page or a person.
 * This information is not included in the web request, nor is it attached to the generated post,
 * so the only way to get it is by watching the user click the reshare button, which
 * the content script does.
 * @returns {string} - The source of the last reshare ("person" or "page").
 * @private
 */
async function getReshareInfo() {
    return browser.tabs.sendMessage(facebookTabId, {"recentReshare": true}).then((response) => {
        return response;
    }, (e) => { console.log("ERROR", e); } );
}

/**
 * Facebook uses the same API endpoint for original posts and for reshares, so
 * this function looks at the request details to differentiate the two.
 * @param {Object} requestDetails - The requestDetails field from the captured web request.
 * @returns {boolean} - Whether this represents a reshare (or, if not, then a post).
 * @private
 */
function isThisPostAReshare(requestDetails) {
    const friendlyName = findFieldFacebook(requestDetails.requestBody.formData,
        "fb_api_req_friendly_name");
    if (friendlyName.includes( "ComposerStoryCreateMutation")) {
        // sometimes things that look like posts are secretly reshares
        const composerType = findFieldFacebook(requestDetails.requestBody.formData,
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
 * @param {Object} requestDetails - the raw request
 * @returns - null if the request is not a valid reshare, empty object otherwise
 * @private
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
    let sharedFromPostId = null // the ID of the original post that's being shared
    let ownerId = null; // we need this if the main method of getting the contents doesn't work
    let newPostMessage = null // any content the user adds when sharing
    if (requestDetails.requestBody.formData &&
        typeof(requestDetails.requestBody.formData) == "object" &&
        "shared_from_post_id" in requestDetails.requestBody.formData &&
        requestDetails.requestBody.formData.shared_from_post_id.length > 0 &&
        "sharer_id" in requestDetails.requestBody.formData &&
        requestDetails.requestBody.formData.sharer_id.length > 0) {
        sharedFromPostId = requestDetails.requestBody.formData.shared_from_post_id[0];
        ownerId = requestDetails.requestBody.formData.sharer_id[0];
        return {sharedFromPostId: sharedFromPostId, ownerId: ownerId};
    }
    else {
        const parsedUrl = new URL(requestDetails.url);
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
 * An object representing the contents of a post as returned by Facebook.
 * @typedef facebookPostContentsDetails
 * @param {string} postText - the plain text of the post.
 * @param {string[]} postAttachments - any links attached to the post.
 */

/**
 * Get the contents and attachments of a Facebook post.
 * Note: Do not pass Facebook post IDs as normal numbers, as they are too large to
 *  maintain precision. Use strings instead.
 * @param {string} postId - the unique ID of the post
 * @returns {facebookPostContentsDetails}
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
 * @param {Object} requestDetails - the raw request.
 * @returns {Object} - an empty object.
 * @private
 */
function verifyRedditPost({requestDetails = null}) {
    return {};
}

/**
 * Return a redditActivityDetails object with all fields initialized to default values.
 * @returns {redditActivityDetails} - default-value Reddit details.
 */
function createBaseRedditObject() {
    return {
        eventType: "", eventTime: 0, postText: "", postAttachments: [],
        subredditName: "", postTitle: "", voteDirection: 0, votedCommentId: "",
        commentAttachments: [], commentText: "", commentedPostId: "", votedPostId: ""
    };
}

/**
 * Parse a Reddit post request into an object.
 * @param {Object} requestDetails - the raw request.
 * @returns {redditActivityDetails} - the parsed object
 * @private
 */
function extractRedditPost({requestDetails = null, eventTime = null}) {
    const details = createBaseRedditObject();
    details.eventTime = eventTime;
    details.eventType = "post";

    if (typeof(requestDetails.requestBody.formData) == "object" &&
        "submit_type" in requestDetails.requestBody.formData &&
        requestDetails.requestBody.formData.submit_type.length > 0 &&
        requestDetails.requestBody.formData.submit_type[0] == "subreddit" &&
        "sr" in requestDetails.requestBody.formData &&
        requestDetails.requestBody.formData.sr.length > 0) {

        details.subredditName = requestDetails.requestBody.formData.sr[0];
    }

    try {
        details.postTitle = requestDetails.requestBody.formData.title[0];
    } catch { //ignore
    }

    // Handle if there's a URL attached to the post
    try {
        const postUrl = requestDetails.requestBody.formData["url"][0];
        details.postAttachments.push(postUrl);
    } catch { //ignore
    }

    let richtext_json = null;
    let text = null;

    try {
        richtext_json = requestDetails.requestBody.formData.richtext_json;
    } catch {
        richtext_json = null;
    }
    try {
        text = requestDetails.requestBody.formData.text;
    } catch {
        text = null;
    }

    details.postText = parseRedditTextContents(richtext_json, text, details.postAttachments, "");
    return details;
}

/* The way we receive the post contents depends on which editor the user used. The
 *  so-called "fancy pants" editor produces JSON, and stores the content in the
 *  `richtext_json` element. The "markdown mode" editor produces a markdown version and stores
 *  it in the `text` element. In either case, we walk the post and construct:
 *   1. A plain-text version of the content, as a viewer would see it, and
 *   2. A list of URLs for all the links contained in the post.
 *
 * When a user adds a URL to the post content, reddit will automatically make it a link,
 *  and this code will add the URL to the set of post attachments. However, the user can
 *  choose to remove the automatically-added link, leaving just the plaintext URL. In this
 *  case, the URL will not be added to the list of post attachments.
 *
 * @param {Object} richtext_json - the output from the fancy pants editor.
 * @param {Object} text - the output from the markdown editor.
 * @param {string[]} attachments - an array to which to add URLs from the contents.
 * @param {string} - a string to which to add text from the contents.
 * @returns {string} - the updated text content of the post.
 */
function parseRedditTextContents(richtext_json, text, attachments, textContent) {
    if (richtext_json != null) {
        /* Fancy pants editor: (new Reddit only)
         * Reddit breaks up what the user types in the post. The "c" element of
         *  the "document" array is another array of objects with "e" and "t" attributes.
         * The "e" attribute tells you the type of element it is ("text" or "link"),
         *  and then the "t" attribute is the text content. For a "link" type, the "u" element
         *  gives the plain URL. Links to other subreddits are special. They're type "r/" (instead
         *  of "link"), and the "t" element is just the name of the subreddit.
         *  So, a post with the content:
         *  Here are some words www.example.com more words link to r/redditdev
         *  would generate a document[0].c with four elements:
         *  {"e":"text", "t":"Here are some words "}
         *  {"e":"link", "t":"www.example.com", "u":"www.example.com"}
         *  {"e":"text", "t":" more words link to"}
         *  {"e":"r/", "t":"redditdev"}
         * To construct the plain-text version of the post, we use the "t" element of links and
         *  subreddit links (prefixing the latter with the string "r/"), and add the "u"
         *  element of links to the list of URLs, as well as adding links to subreddits by
         *  prefixing the subreddit name with "https://www.reddit.com/r/".
         */
        let delim = "";
        const postObject = JSON.parse(richtext_json);
        if (typeof(postObject) == "object" && "document" in postObject) {
            for (const paragraph of postObject.document) {
                if (typeof(paragraph) == "object" && "c" in paragraph) {
                    for (const element of paragraph.c) {
                        if (element.e == "text") {
                            textContent = textContent.concat(delim, element.t);
                        } else if (element.e == "link") {
                            textContent = textContent.concat(delim, element.t);
                            attachments.push(element.u);
                        } else if (element.e == "r/") {
                            textContent = textContent.concat(delim, "r/", element.t);
                            attachments.push("https://www.reddit.com/r/", element.t);
                        }
                        delim = "";
                    }
                }
                delim = "\n\n"; // reddit separates paragraphs with two newlines
            }
        }
    } else if (text != null) {
        /* Markdown mode editor:
         * Reddit supports a few variations of links in markdown, depending on how the user
         *  wants to communicate the hover text. All of the following are valid, and items 2-4
         *  will produce the same result:
         *   1. [display text](https://example.com)
         *   2. [display text](https://example.com 'hover text')
         *   3. [display text](https://example.com "hover text")
         *   4. [display text](https://example.com (hover text))
         * To construct the plain-text version of the post, we use the display text portion of the
         *  link, and add the URL portion to the list of links found in the post.
         */
        const markdownLink = /\[([^\]]*)\]\(([^ )]*) *(?:|\)|\([^)]*\)|"[^"]*"|'[^']*')\)/;
        for (let paragraph of text) {
            let linkResult;
            while ((linkResult = markdownLink.exec(paragraph))) {
                paragraph = paragraph.replace(linkResult[0], linkResult[1]);
                attachments.push(linkResult[2]);
            }
            textContent = textContent.concat(paragraph);
        }
    }
    return textContent;
}


/**
 * Check that a request is a valid Reddit comment.
 * @param {Object} requestDetails - the raw request.
 * @returns {Object} - null if the request is not valid, empty object otherwise.
 * @private
 */
function verifyRedditComment({requestDetails = null}) {
    if (!(requestDetails.requestBody.formData.thing_id &&
        (requestDetails.requestBody.formData.richtext_json ||
           requestDetails.requestBody.formData.text))) { return null; }
    return {};
}

/**
 * Parse a Reddit comment request into an object.
 * @param {Object} requestDetails - the raw request.
 * @returns {redditActivityDetails} - the parsed object.
 * @private
 */
function extractRedditComment({requestDetails = null, eventTime = null}) {
    const details = createBaseRedditObject();
    details.eventTime = eventTime;
    details.eventType = "comment";

    try {
        details.commentedPostId = requestDetails.requestBody.formData.thing_id[0];
    } catch { //ignore
    }

    let richtext_json = null;
    let text = null;

    try {
        richtext_json = requestDetails.requestBody.formData.richtext_json;
    } catch {
        richtext_json = null;
    }

    try {
        text = requestDetails.requestBody.formData.text;
    } catch {
        text = null;
    }

    details.commentText = parseRedditTextContents(
        richtext_json, text, details.commentAttachments, "");

    return details;
}

/**
 * Check that a request is a valid Reddit post vote
 * @param {Object} requestDetails - the raw request
 * @returns {Object} - null if the request is not valid, empty object otherwise
 * @private
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
 * @param {Object} requestDetails - the raw request.
 * @returns {redditActivityDetails} - the parsed object.
 * @private
 */
function extractRedditPostVote({requestDetails = null, eventTime = null}) {
    const details = createBaseRedditObject();
    details.eventTime = eventTime;
    details.eventType = "postVote";
    try {
        details.voteDirection = requestDetails.requestBody.formData.dir[0];
    } catch { //ignore
    }
    try {
        details.votedPostId = requestDetails.requestBody.formData.id[0];
    } catch { //ignore
    }

    return details;
}

/**
 * Check that a request is a valid Reddit comment vote
 * @param {Object} requestDetails - the raw request
 * @returns {Object} - null if the request is not valid, empty object otherwise
 * @private
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
 * @param {Object} requestDetails - the raw request
 * @returns {redditActivityDetails} - the parsed object
 * @private
 */
function extractRedditCommentVote({requestDetails = null, eventTime = null}) {
    const details = createBaseRedditObject();
    details.eventTime = eventTime;
    details.eventType = "commentVote";
    try {
        details.voteDirection = requestDetails.requestBody.formData.dir[0];
    } catch { //ignore
    }
    try {
        details.votedCommentId = requestDetails.requestBody.formData.id[0];
    } catch { //ignore
    }

    return details;
}

/**
 * For a given subreddit name, return whether it is private or public.
 * @param {string} subredditName - The name of the subreddit, without leading "r/".
 * @returns {Promise} - resolves to a string representing the subreddit's status, or "unknown".
 */
export function checkSubredditStatus(subredditName) {
    if (subredditName == "") return "unknown";
    return new Promise((resolve, reject) => {
        fetch(`https://www.reddit.com/r/${subredditName}/about.json`).then(responseFF => {
            responseFF.text().then(response => {
                const subredditInfo = JSON.parse(response);
                if (typeof(subredditInfo) == "object" &&
                    "error" in subredditInfo && subredditInfo.error == 403 &&
                    "reason" in subredditInfo && subredditInfo.reason == "private") {
                    resolve("private");
                    return;
                }
                if (typeof(subredditInfo) == "object" &&
                    "data" in subredditInfo &&
                    typeof(subredditInfo.data) == "object" &&
                    "subreddit_type" in subredditInfo.data) {
                    resolve(subredditInfo.data.subreddit_type);
                    return;
                }
                resolve("unknown");
            });
        });
    });
}

function addIfExists(sourceObject, destinationObject, sourceFieldName,
    destinationFieldName, defaultValue, isArray=false) {
    if (!(destinationFieldName in destinationObject)) {
        destinationObject[destinationFieldName] = defaultValue;
    }

    if (sourceFieldName in sourceObject) {
        if (isArray) {
            destinationObject[destinationFieldName].push(sourceObject[sourceFieldName]);
        } else {
            destinationObject[destinationFieldName] = sourceObject[sourceFieldName];
        }
    }
}

/**
 * An object representing the contents of a post or comment as returned by Reddit.
 * @typedef redditThingContentsDetails
 * @param {string} postText - the plain text of the post.
 * @param {string[]} postAttachments - any links attached to the post.
 * @param {string} title - the title of the post.
 */

/**
 * Retrieve a reddit comment or post ("thing" is the official Reddit term).
 * @param {string} thingId - the unique ID of the post or comment, with identifier ("t1_" or "t3_").
 * @returns {redditThingContentsDetails} - the thing's contents.
 */
export function getRedditThingContents(thingId) {
    return new Promise((resolve, reject) => {
        const reqString = `https://www.reddit.com/api/info.json?id=${thingId}`;
        fetch(reqString).then((responseFF) => {
            responseFF.text().then((response) => {
                const details = {};
                const allPostContents = JSON.parse(response).data.children[0].data;
                addIfExists(allPostContents, details, "title", "title", "");
                addIfExists(allPostContents, details, "url_overridden_by_dest",
                    "postAttachments", [], true);
                addIfExists(allPostContents, details, "selftext", "postText", "");
                addIfExists(allPostContents, details, "body", "postText", "");
                details.postText = parseRedditTextContents(
                    null, [details.postText], details.postAttachments, "");
                resolve(details)
            });
        });
    });
}
