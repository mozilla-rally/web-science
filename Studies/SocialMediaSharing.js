/**
 * This module is used to run studies that track the user's
 * social media sharing of links.
 * 
 * @module WebScience.Studies.SocialMediaSharing
 */

import * as WebScience from "../WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("SocialMediaSharing");

/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;

/**
 * A UrlMatcher object for testing urls
 * @type {Object}
 * @private
 */
var urlMatcher = null;

/**
 * A regular expression object for testing urls
 * @type {RegExp}
 * @private
 */
var shortUrlMatcher = null;

/**
 * A counter to give each record a unique ID
 * @type {Object}
 * @private
 */
var shareIdCounter = null;

/**
 * Start a social media sharing study. Note that only one study is supported per extension.
 * @param {Object} options - A set of options for the study.
 * @param {string[]} [options.domains=[]] - The domains of interest for the study.
 * @param {boolean} [options.facebook=false] - Whether to track URL shares on Facebook.
 * @param {boolean} [options.twitter=false] - Whether to track URL shares on Twitter.
 * @param {boolean} [options.reddit=false] - Whether to track URL shares on Reddit.
 * @param {boolean} [options.privateWindows=false] - Whether to track URL shares made in private windows.
 */
export async function runStudy({
    domains = [],
    facebook = false,
    twitter = false,
    reddit = false,
    privateWindows = false
}) {
    if (privateWindows) WebScience.Utilities.SocialMediaActivity.enablePrivateWindows();
    if (facebook) {
        WebScience.Utilities.SocialMediaActivity.registerFacebookActivityTracker(facebookLinks, ["post", "reshare"]);
    }
    if (reddit) {
        WebScience.Utilities.SocialMediaActivity.registerRedditActivityTracker(redditLinks, ["post"]);
    }
    if (twitter) {
        WebScience.Utilities.SocialMediaActivity.registerTwitterActivityTracker(twitterLinks, ["tweet", "retweet"]);
    }

    storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.SocialMediaSharing")).initialize();
    urlMatcher = new WebScience.Utilities.Matching.UrlMatcher(domains);
    var sdrs = await browser.storage.local.get("shortDomainRegexString");
    shortUrlMatcher = new RegExp(sdrs.shortDomainRegexString),

    // Make this available to content scripts
    // await browser.storage.local.set({ "WebScience.Studies.SocialMediaSharing.privateWindows": privateWindows });
    // Use a unique identifier for each URL the user shares
    shareIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.SocialMediaSharing.nextShareId")).initialize();
}

/**
 * The callback for Twitter events.
 * We track tweets and retweets, and only care about links within them. Note that "tweet"s contains
 *  reply tweets and retweet-with-comment.
 * @param details - the description of the event
 */
async function twitterLinks(details) {
    var urlsToSave = [];
    if (details.eventType == "tweet") {
        await filterTokensToUrls(details.postText.split(/\s+/), urlsToSave);
        await filterTokensToUrls([details.attachmentUrl], urlsToSave);
    } else if (details.eventType == "retweet") {
        var retweetedTweets = await WebScience.Utilities.SocialMediaActivity.getTweetContent(details.retweetedId);
        var retweetedTweet = retweetedTweets[details.retweetedId];
        await filterTokensToUrls(retweetedTweet.full_text.split(/\s+/), urlsToSave);
        for (var url of retweetedTweet.entities.urls) {
            await filterTokensToUrls([url], urlsToSave);
        }
    }
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord(details.eventTime, "twitter", urlToSave, details.eventTime);
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog("Twitter: " + JSON.stringify(shareRecord));
    }
}

/**
 * The callback for Facebook events.
 * We track posts and reshares of posts, and only care about links within them.
 * @param details - the description of the event
 */
async function facebookLinks(details) {
    var urlsToSave = [];
    if (details.eventType == "post") {
        var post = await WebScience.Utilities.SocialMediaActivity.getFacebookPostContents(details.postId,
            details.ownerId ? details.ownerId : details.groupId);
        for (var contentItem of post.content) {
            var postTokens = contentItem.split(/\s+/);
            await filterTokensToUrls(postTokens, urlsToSave);
        }
        await filterTokensToUrls(post.urlsInMediaBox, urlsToSave);
    } else if (details.eventType == "reshare") {
        var post = await WebScience.Utilities.SocialMediaActivity.getFacebookPostContents(details.postId,
            details.ownerId);
        for (var contentItem of post.content) {
            var postTokens = contentItem.split(/\s+/);
            await filterTokensToUrls(postTokens, urlsToSave);
        }
        await filterTokensToUrls(post.urlsInMediaBox, urlsToSave);
    }
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord(details.eventTime, "facebook", urlToSave, details.eventTime);
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog("Facebook: " + JSON.stringify(shareRecord));
    }
}

/**
 * The callback for Reddit events.
 * We track posts, and only care about links within them,
 * @param details - the description of the event
 */
async function redditLinks(details) {
    var urlsToSave = [];
    if (details.eventType == "post") {
        await filterTokensToUrls([details.attachment], urlsToSave);
        for (var content of details.postBody) {
            if (content.e == "text") await filterTokensToUrls(content.t.split(/\s+/), urlsToSave);
            if (content.e == "link") await filterTokensToUrls([content.t], urlsToSave);
        }
    }
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord(details.eventTime, "reddit", urlToSave, details.eventTime);
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog("Reddit: " + JSON.stringify(shareRecord));
    }
}

/* Utilities */

/**
 * Create an object that records a sharing event.
 * @param {number} shareTime - The time that the user shared the URL.
 * @param {string} platform - The social media platform where the user
 * shared the URL.
 * @param {string} url - The URL that the user shared.
 * @param {string} event - The type of sharing event.
 * @returns {Object} - An object containing the `shareTime`, `platform`,
 * `url`, and `event` as properties, as well as the Navigation and browser
 * history data for the given url.
 */
async function createShareRecord(shareTime, platform, url, event) {
    var pageVisits = await WebScience.Studies.Navigation.findUrlVisit(url);
    var historyVisits = await browser.history.search({text: WebScience.Utilities.Matching.stripUrl(url)});
    return { shareTime, platform, url, event, pageVisits, historyVisits };
}

/**
 * Retrieve the study data as an object. Note that this could be very
 * slow if there is a large volume of study data.
 * @returns {(Object|null)} - The study data, or `null` if no data
 * could be retrieved.
 */
export async function getStudyDataAsObject() {
    if (storage != null)
        return await storage.getContentsAsObject();
    return null;
}

/**
 * Normalize urls by stripping url parameters and then remove duplicates
 * @param {string[]} urls - the urls to normalize and deduplicate
 * @returns {Set} - unique normalized urls
 */
function deduplicateUrls(urls) {
    var uniqueUrls = new Set();
    for (var url of urls) {
        uniqueUrls.add(WebScience.Utilities.Matching.removeUrlParams(url));
    }
    return uniqueUrls;
}

/**
 * Check whether a given token is a known short url, and resolve if so.
 * @param {string} url - a token that might be a short url
 * @return {Object} - {`result`: whether `url` was a resolveable short url, `resolvedUrl`: the full url, if available}
 */
async function checkShortUrl(url) {
    if (shortUrlMatcher.test(url)) {
        var resolvedUrlObj = await WebScience.Utilities.LinkResolution.resolveUrl(url);
        if (urlMatcher.testUrl(resolvedUrlObj.dest)) {
            return {result: true, resolvedUrl: resolvedUrlObj.dest}
        }
    }
    return {result:false};
}

/**
 * Filter an array of tokens into relevant urls, including resolving short urls.
 * @param {String[]} unfilteredTokens - array of tokens
 * @param {String[]} urlsToSave - an array to add the relevant urls to
 */
async function filterTokensToUrls(unfilteredTokens, urlsToSave) {
    for (var unfilteredToken of unfilteredTokens) {
        if (urlMatcher.testUrl(unfilteredToken)) {
            urlsToSave.push(unfilteredToken);
        }
        else {
            var resolved = await checkShortUrl(unfilteredToken);
            if (resolved.result) {
                urlsToSave.push(resolved.resolvedUrl);
            }
        }
    }
}
