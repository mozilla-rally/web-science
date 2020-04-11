/**
 * This module is used to run studies that track the user's
 * social media sharing of links.
 * 
 * @module WebScience.Studies.SocialMediaLinkSharing
 */

import * as WebScience from "../WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("SocialMediaLinkSharing");

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
var shortDomainMatcher = null;

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
        WebScience.Utilities.SocialMediaActivity.registerFacebookActivityTracker(facebookLinks, ["post", "reshare", "react"]);
    }
    if (reddit) {
        WebScience.Utilities.SocialMediaActivity.registerRedditActivityTracker(redditLinks, ["post"]);
    }
    if (twitter) {
        //WebScience.Utilities.SocialMediaActivity.registerTwitterActivityTracker(twitterFaves, ["favorite"]);
        WebScience.Utilities.SocialMediaActivity.registerTwitterActivityTracker(twitterLinks, ["tweet", "retweet", "favorite"]);
    }

    storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.SocialMediaLinkSharing")).initialize();
    urlMatcher = new WebScience.Utilities.Matching.UrlMatcher(domains);
    //var sdrs = await browser.storage.local.get("shortDomainRegexString");
    var shortDomains = WebScience.Utilities.LinkResolution.getShortDomains();
    var shortDomainPattern = WebScience.Utilities.Matching.createUrlRegexString(shortDomains);
    shortDomainMatcher = new RegExp(shortDomainPattern);

    // Make this available to content scripts
    await browser.storage.local.set({ "WebScience.Studies.SocialMediaLinkSharing.privateWindows": privateWindows });
    // Use a unique identifier for each URL the user shares
    shareIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.SocialMediaLinkSharing.nextShareId")).initialize();
}

/**
 * The callback for Twitter events.
 * We track tweets and retweets, and only care about links within them. Note that "tweet"s contains
 *  reply tweets and retweet-with-comment.
 * @param details - the description of the event
 */
async function twitterLinks(details) {
    // This is the callback for any kind of tracked Twitter event
    // If it's a tweet (includes quote tweets and retweet-with-comment), we want to parse the user's
    //  content and log matching urls as "tweet"s.
    // For retweets, we parse the retweeted content and log matching urls as "retweet"s.
    var urlsToSave = [];
    if (details.eventType == "tweet") {
        await extractRelevantUrlsFromTokens(details.postText.split(/\s+/), urlsToSave);
        await extractRelevantUrlsFromTokens([details.attachmentUrl], urlsToSave);
    } else if (details.eventType == "retweet") {
        var retweetedTweets = await WebScience.Utilities.SocialMediaActivity.getTweetContent(details.retweetedId);
        var retweetedTweet = retweetedTweets[details.retweetedId];
        await extractRelevantUrlsFromTokens(retweetedTweet.full_text.split(/\s+/), urlsToSave);
        for (var url of retweetedTweet.entities.urls) {
            await extractRelevantUrlsFromTokens([url], urlsToSave);
        }
    } else if (details.eventType == "favorite") {
        var favoritedTweets = await WebScience.Utilities.SocialMediaActivity.getTweetContent(details.favoritedId);
        var favoritedTweet = favoritedTweets[details.favoritedId];
        await extractRelevantUrlsFromTokens(favoritedTweet.full_text.split(/\s+/), urlsToSave);
        for (var url of favoritedTweet.entities.urls) {
            await extractRelevantUrlsFromTokens([url], urlsToSave);
        }
    }
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord(details.eventType, "twitter", urlToSave, details.eventType);
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog("Twitter: " + JSON.stringify(shareRecord));
    }
}

async function twitterFaves(details) {
    var urlsToSave = [];
    var favoritedTweets = await WebScience.Utilities.SocialMediaActivity.getTweetContent(details.favoritedId);
    var favoritedTweet = favoritedTweets[details.favoritedId];
    await extractRelevantUrlsFromTokens(favoritedTweet.full_text.split(/\s+/), urlsToSave);
    for (var url of favoritedTweet.entities.urls) {
        await extractRelevantUrlsFromTokens([url], urlsToSave);
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
        for (var contentItem of details.postText) {
            var postTokens = contentItem.split(/\s+/);
            await extractRelevantUrlsFromTokens(postTokens, urlsToSave);
        }
        await extractRelevantUrlsFromTokens(details.postUrls, urlsToSave);
    } else if (details.eventType == "reshare") {
        if (details.postId) {
            // in old facebook, we get the postid and need to go look it up
            var post = await WebScience.Utilities.SocialMediaActivity.getFacebookPostContents(details.postId);
            for (var contentItem of post.content) {
                var postTokens = contentItem.split(/\s+/);
                await extractRelevantUrlsFromTokens(postTokens, urlsToSave);
            }
            await extractRelevantUrlsFromTokens(post.attachedUrls, urlsToSave);
        } else {
            // in new facebook, we get the post contents and no ID
            await extractRelevantUrlsFromTokens(details.attachedUrls, urlsToSave);
        }
    } else if (details.eventType == "react") {
        var post = await WebScience.Utilities.SocialMediaActivity.getFacebookPostContents(details.postId);
        for (var contentItem of post.content) {
            var postTokens = contentItem.split(/\s+/);
            await extractRelevantUrlsFromTokens(postTokens, urlsToSave);
        }
        await extractRelevantUrlsFromTokens(post.attachedUrls, urlsToSave);
        details.eventType = details.eventType + " " + details.reactionType;
    }
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord(details.eventTime, "facebook", urlToSave, details.eventType);
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
        await extractRelevantUrlsFromTokens([details.attachment], urlsToSave);
        for (var content of details.postBody) {
            if (content.e == "text") await extractRelevantUrlsFromTokens(content.t.split(/\s+/), urlsToSave);
            if (content.e == "link") await extractRelevantUrlsFromTokens([content.t], urlsToSave);
        }
    }
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord(details.eventTime, "reddit", urlToSave, details.eventType);
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
    if (shortDomainMatcher.test(url)) {
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
async function extractRelevantUrlsFromTokens(unfilteredTokens, urlsToSave) {
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
