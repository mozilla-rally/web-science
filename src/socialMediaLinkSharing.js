/**
 * This module enables observing when the user shares a link on social media.
 *
 * @module socialMediaLinkSharing
 */

import * as events from "./events.js";
import * as debugging from "./debugging.js";
import * as matching from "./matching.js";
import * as socialMediaActivity from "./socialMediaActivity.js";
import * as linkResolution from "./linkResolution.js";

/**
 * @type {Events.Event<socialMediaShareCallback, socialMediaShareOptions>}
 */
export const onShare = events.createEvent({
    name: "webScience.socialMediaLinkSharing.onShare",
    addListenerCallback: addListener,
    removeListenerCallback: removeListener
});

/**
 * A callback function for the social media share event.
 * @callback socialMediaShareCallback
 * @param {socialMediaShareDetails} details - Additional information about the social media share event.
 */

/**
 * An object giving information about a share on social media.
 * @typedef {Object} socialMediaShareDetails
 * @property {string} platform - the social media platform on which the user shared a link ("facebook",
 *  "twitter", or "reddit").
 * @property {number} shareTime - timestamp of the user's share.
 * @property {boolean} tracked - whether this object gives information about a tracked link share or
 *  about the count of untracked link shares.
 *
 * @property {string} eventType - for a tracked share, the action taken by the
 *  user (e.g., "tweet", "reshare", etc).
 * @property {string} url - for a tracked share, the URL that the user shared.
 * @property {string} audience - for a tracked share, whether the share is visible to all ("public")
 *  or not ("restricted"). When the privacy status cannot be determined, is set to "unknown".
 * @property {string} reshareSource - for a tracked reshare on Facebook, whether the reshared
 *  post came from a user's profile ("person"), or a company/organization ("page").
 *
 * @property {number} untrackedCount - the number of untracked links shared by a recent share event.
 */

/**
 * Options when adding a social media share event listener.
 * @typedef {Object} socialMediaShareOptions
 * @property {string[]} [matchPattern=[]] - The webpages of interest for the measurement, specified with WebExtensions match patterns.
 * @property {boolean} facebook - whether to measure shares that happen on Facebook.
 * @property {boolean} twitter - whether to measure shares that happen on Twitter.
 * @property {boolean} reddit - whether to measure shares that happen on Reddit.
 */



/**
 * @constant {debugging.debuggingLogger}
 * @private
 */
const debugLog = debugging.getDebuggingLog("socialMediaLinkSharing");


/**
 * The match patterns for URLs of interest.
 * @type {matching.MatchPatternSet}
 * @private
 */
let destinationMatcher = null;

/**
 * Unlike posts on Facebook, which have individual privacy controls, or posts on Reddit, whose
 * privacy is determined by the subreddit in which they are posted, the privacy of a Tweet is
 * determined by a global setting for each account. We pull this setting once and store it.
 * @type {string}
 * @private
 */
let twitterPrivacySetting = "unknown";

/**
 * Function to start measurement when a listener is added
 * TODO: deal with multiple listeners with different match patterns
 * @param {socialMediaShareCallback} listener - new listener being added
 * @param {socialMediaShareOptions} options - configuration for the events to be sent to this listener
 * @private
 */
function addListener(listener, options) {
    startMeasurement(options);
}

/**
 * Function to end measurement when the last listener is removed
 * @param {socialMediaShareCallback} listener - listener that was just removed
 * @private
 */
function removeListener(listener) {
    if (!this.hasAnyListeners()) {
        stopMeasurement();
    }
}

/**
 * Return a socialMediaShareDetails object with all fields initialized to default values.
 * @returns {socialMediaShareDetails} - default-value share details.
 * @private
 */
function createBaseShareObject() {
    return {
        platform: "", shareTime: 0, url: "", audience: "", eventType: "", reshareSource: "",
        type: "", untrackedCount: 0
    };
}

/**
 * Start a social media sharing study. Note that only one study is supported per extension.
 * @param {Object} options - A set of options for the study.
 * @param {string[]} [options.domains=[]] - The domains of interest for the study.
 * @param {boolean} [options.facebook=false] - Whether to track URL shares on Facebook.
 * @param {boolean} [options.twitter=false] - Whether to track URL shares on Twitter.
 * @param {boolean} [options.reddit=false] - Whether to track URL shares on Reddit.
 * @private
 */
async function startMeasurement({
    destinationMatchPatterns = [],
    facebook = false,
    twitter = false,
    reddit = false
}) {
    if (facebook) {
        socialMediaActivity.onFacebookActivity.addListener(facebookLinks, {
            eventTypes: ['post', 'reshare']});
    }
    if (reddit) {
        socialMediaActivity.onRedditActivity.addListener(redditLinks, {
            eventTypes: ['post']});
    }
    if (twitter) {
        socialMediaActivity.onTwitterActivity.addListener(twitterLinks, {
            eventTypes: ['tweet', 'retweet', 'favorite']});
    }

    destinationMatcher = matching.createMatchPatternSet(destinationMatchPatterns);
}

/**
 * @private
 */
function stopMeasurement() {
    //TODO
}

/**
 * Quote tweets are implemented as regular tweets that contain a link to another tweet.
 * This function determines whether a given link is to a tweet or not.
 * @param {string} url - a link to check.
 * @returns {string[]} - result of matching regex on url.
 * @private
 */
function isTwitterLink(url) {
    const twitterLink = /twitter\.com\/[0-9|a-z|A-Z|_]*\/status\/([0-9]*)/;
    return twitterLink.exec(url);
}

/**
 * Given a URL, determine whether it goes to another tweet, and parse that tweet if so.
 * @param {string[]} twitterUrls - a list of URLs that might link to another tweet.
 * @param {string[]} urlsToSave - an array in which to place found URLs that match the study's
 *  domains.
 * @param {string[]} urlsNotToSave - an array in which to place found URLs that do not match
 *  study's domains.
 * @private
 */
async function parsePossibleTwitterQuoteTweet(twitterUrls, urlsToSave, urlsNotToSave) {
    for (const twitterUrl of twitterUrls) {
        const matchTwitter = isTwitterLink(twitterUrl);
        if (matchTwitter == null) return;
        await parseTweetById(matchTwitter[1], urlsToSave, urlsNotToSave);
    }
}

/**
 * Given a tweet's unique ID, fetch it and extract URLs.
 * @param {string} tweetId - ID of a tweet to parse.
 * @param {string[]} urlsToSave - an array in which to place found URLs that match the study's
 *  domains.
 * @param {string[]} urlsNotToSave - an array in which to place found URLs that do not match
 *  study's domains.
 * @private
 */
async function parseTweetById(tweetId, urlsToSave, urlsNotToSave) {
    if (!tweetId) return;
    const tweetContent = await socialMediaActivity.getTweetContent(tweetId);
    if (tweetContent !== null) {
        await parseSingleTweet(tweetContent, urlsToSave, urlsNotToSave);
    }
}

/**
 * Given a tweet's contents, extract relevant URLs.
 * @param {tweetContentDetails} tweetContent - information about the tweet.
 * @param {string[]} urlsToSave - an array in which to place found URLs that match the study's
 *  domains.
 * @param {string[]} urlsNotToSave - an array in which to place found URLs that do not match
 *  study's domains.
 */
async function parseSingleTweet(tweetContent, urlsToSave, urlsNotToSave) {
    try {
        await extractRelevantUrlsFromTokens(tweetContent.tweetText.split(/\s+/),
            urlsToSave, urlsNotToSave);
    } catch {
        debugLog("failed extracting relevant urls from tweet");
    }
    try {
        for (const url of tweetContent.tweetAttachments) {
            await extractRelevantUrlsFromTokens([url], urlsToSave, urlsNotToSave);
        }
    } catch {
        debugLog("Failed parsing/extracting urls from tweet");
    }
}

/**
 * The callback for Twitter events.
 * Tracks links in tweets and retweets. Note that "tweet"s contains
 *  reply tweets and retweet-with-comment (quote tweets).
 * @param {twitterActivityDetails} details - the description of the event
 * @private
 */
async function twitterLinks(details) {
    // This is the callback for any kind of tracked Twitter event
    // If it's a tweet (includes quote tweets and retweet-with-comment), we want to parse the user's
    //  content and log matching urls as "tweet"s.
    // For retweets, we parse the retweeted content and log matching urls as "retweet"s.
    if (twitterPrivacySetting == "unknown") {
        checkTwitterAccountStatus();
    }
    let urlsToSave = [];
    let urlsNotToSave = [];
    if (details.eventType == "tweet") {
        await parseSingleTweet(details, urlsToSave, urlsNotToSave);
        try {
            await parsePossibleTwitterQuoteTweet(details.tweetAttachments,
                urlsToSave, urlsNotToSave);
        } catch {
            debugLog("failed parsing possible quote tweet");
        }

    } else if (details.eventType == "retweet") {
        const retweetedTweet = await socialMediaActivity.getTweetContent(details.sharedId);
        await parseSingleTweet(retweetedTweet, urlsToSave, urlsNotToSave);

        try {
            await parseTweetById(retweetedTweet.retweetedId, urlsToSave, urlsNotToSave);
        } catch {
            debugLog("failed parsing quote tweet from retweet");
        }

    } else if (details.eventType == "favorite") {
        let favoritedTweet = await socialMediaActivity.getTweetContent(details.sharedId);
        try {
            if (favoritedTweet.retweetedId !== "") {
                favoritedTweet = await socialMediaActivity.getTweetContent(favoritedTweet.retweetedId);
            }
        } catch {
            debugLog("failed finding retweeted tweet inside favorited tweet");
        }
        await parseSingleTweet(favoritedTweet, urlsToSave, urlsNotToSave);

        try {
            await parseTweetById(favoritedTweet.quotedId, urlsToSave, urlsNotToSave);
        } catch {
            debugLog("failed parsing quote tweet from favorite");
        }
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (const urlToSave of urlsToSave) {
        if (isTwitterLink(urlToSave)) continue;
        const shareRecord = createBaseShareObject();
        shareRecord.shareTime = details.eventTime;
        shareRecord.platform = "twitter";
        shareRecord.url = urlToSave;
        shareRecord.audience = twitterPrivacySetting;
        shareRecord.eventType = details.eventType;
        shareRecord.type = "tracked";
        onShare.notifyListeners([ shareRecord ]);
        debugLog("Twitter: " + JSON.stringify(shareRecord));
    }
    let newUntracked = 0;
    urlsNotToSave = deduplicateUrls(urlsNotToSave);
    for (const urlNotToSave of urlsNotToSave) {
        if (!(isTwitterLink(urlNotToSave))) {
            newUntracked++;
        }
    }
    const untrackedRecord = createBaseShareObject();
    untrackedRecord.type = "untracked";
    untrackedRecord.platform = "twitter";
    untrackedRecord.untrackedCount = newUntracked;
    untrackedRecord.shareTime = details.eventTime;
    onShare.notifyListeners([ untrackedRecord ]);
}

/**
 * The callback for Facebook events.
 * Tracks links in posts and reshares of posts.
 * @param {facebookActivityDetails} details - the description of the event
 * @private
 */
async function facebookLinks(details) {
    let urlsToSave = [];
    let urlsNotToSave = [];
    if (details.eventType == "post") {
        const postTokens = details.postText.split(/\s+/);
        await extractRelevantUrlsFromTokens(postTokens, urlsToSave, urlsNotToSave);
        await extractRelevantUrlsFromTokens(details.postAttachments, urlsToSave, urlsNotToSave);

    } else if (details.eventType == "reshare") {
        const postTokens = details.postText.split(/\s+/);
        await extractRelevantUrlsFromTokens(postTokens, urlsToSave, urlsNotToSave);
        await extractRelevantUrlsFromTokens(details.postAttachments, urlsToSave, urlsNotToSave);

        const resharedPost = await socialMediaActivity.getFacebookPostContents(details.actedUponPostId);
        const resharedPostTokens = resharedPost.postText.split(/\s+/);
        await extractRelevantUrlsFromTokens(resharedPostTokens, urlsToSave, urlsNotToSave);
        await extractRelevantUrlsFromTokens(resharedPost.postAttachments, urlsToSave, urlsNotToSave);
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (const urlToSave of urlsToSave) {
        const shareRecord = createBaseShareObject();
        shareRecord.shareTime = details.eventTime;
        shareRecord.platform = "facebook";
        shareRecord.audience = details.postAudience;
        shareRecord.url = urlToSave;
        shareRecord.eventType = details.eventType;
        shareRecord.reshareSource = details.reshareSource;
        shareRecord.type = "tracked";
        onShare.notifyListeners([ shareRecord ]);
        debugLog("Facebook: " + JSON.stringify(shareRecord));
    }
    urlsNotToSave = deduplicateUrls(urlsNotToSave);
    const untrackedRecord = createBaseShareObject();
    untrackedRecord.type = "untracked";
    untrackedRecord.platform = "facebook";
    untrackedRecord.untrackedCount = urlsNotToSave.size;
    untrackedRecord.shareTime = details.eventTime;
    onShare.notifyListeners([ untrackedRecord ]);
}


/**
 * The callback for Reddit events.
 * Tracks links in posts (includes both text and link posts).
 * @param {redditActivityDetails} details - the description of the event
 * @private
 */
async function redditLinks(details) {
    let urlsToSave = [];
    let urlsNotToSave = [];
    let audience = "unknown";
    if (details.eventType == "post") {
        await extractRelevantUrlsFromTokens(details.postAttachments, urlsToSave, urlsNotToSave);
        for (const paragraph of details.postText) {
            for (const content of paragraph) {
                if (content.e == "text") await extractRelevantUrlsFromTokens(content.t.split(/\s+/), urlsToSave, urlsNotToSave);
                if (content.e == "link") await extractRelevantUrlsFromTokens([content.t], urlsToSave, urlsNotToSave);
            }
        }
        if (details.subredditName !== "") {
            audience = await socialMediaActivity.checkSubredditStatus(details.subredditName);
        }
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (const urlToSave of urlsToSave) {
        const shareRecord = createBaseShareObject();
        shareRecord.shareTime = details.eventTime;
        shareRecord.platform = "reddit";
        shareRecord.url = urlToSave;
        shareRecord.audience = audience;
        shareRecord.eventType = details.eventType;
        shareRecord.type = "tracked";

        onShare.notifyListeners([ shareRecord ]);
        debugLog("Reddit: " + JSON.stringify(shareRecord));
    }
    urlsNotToSave = deduplicateUrls(urlsNotToSave);
    const untrackedRecord = createBaseShareObject();
    untrackedRecord.type = "untracked";
    untrackedRecord.platform = "reddit";
    untrackedRecord.untrackedCount = urlsNotToSave.size;
    untrackedRecord.shareTime = details.eventTime;
    onShare.notifyListeners([ untrackedRecord ]);
}

/* Utilities */

/**
 * Normalize urls by stripping url parameters and then remove duplicates.
 * @param {string[]} urls - the urls to normalize and deduplicate.
 * @returns {Set<string>} - unique normalized urls.
 * @private
 */
function deduplicateUrls(urls) {
    const uniqueUrls = new Set();
    for (const url of urls) {
        uniqueUrls.add(matching.normalizeUrl(url));
    }
    return uniqueUrls;
}

/**
 * Check whether a given token is a known short url, and resolve if so.
 * @param {string} url - a token that might be a short url.
 * @returns {string} - the resolved short url, or the original token if it was not a short url.
 * @private
 */
async function expandShortUrl(token) {
    try {
        if (linkResolution.urlShortenerRegExp.test(token)) {
            const resolved = await linkResolution.resolveUrl(token)
            if (resolved) return resolved;
        }
        return token;
    } catch {
        return token;
    }
}

/**
 * Check whether a given string is a parsable URL.
 * @param {string} token - a string that might be a URL.
 * @returns {boolean} - whether the token was a URL.
 * @private
 */
function isUrl(token) {
    let url;
    try { url = new URL(token); }
    catch (_) { return false; }
    return url.protocol == "http:" || url.protocol == "https:";
}

/**
 * Filter an array of tokens into relevant and non-relevant URLs, including resolving short URLs,
 *  normalizing, and de-duplicating.
 * @param {String[]} unfilteredTokens - array of tokens.
 * @param {String[]} urlsToSave - an array to which to add the relevant URLs.
 * @param {String[]} urlsToSave - an array to which to add the non-relevant URLs.
 * @private
 */
async function extractRelevantUrlsFromTokens(unfilteredTokens, urlsToSave, urlsNotToSave) {
    for (let unfilteredToken of unfilteredTokens) {
        unfilteredToken = stripToken(unfilteredToken);
        if (!isUrl(unfilteredToken)) {
            continue;
        }
        unfilteredToken = await expandShortUrl(unfilteredToken);
        if (destinationMatcher.matches(unfilteredToken)) {
            urlsToSave.push(unfilteredToken);
            continue;
        }
        urlsNotToSave.push(unfilteredToken);
    }
}

/**
 * Checks whether the user's Twitter account is set to protected or not.
 * See twitterPrivacySetting for more.
 * @private
 */
function checkTwitterAccountStatus() {
    fetch("https://twitter.com", {credentials: "include"}).then((response) => {
        response.text().then(resp => {
            const protectedIndex = resp.indexOf("\"protected\"");
            let isProtected = "";
            if (protectedIndex > 0) {
                isProtected = resp.substring(protectedIndex + 12, protectedIndex + 17);
            }
            if (isProtected.indexOf("true") > -1) twitterPrivacySetting = "restricted";
            else if (isProtected.indexOf("false") > -1) twitterPrivacySetting = "public";
        });
    });
}

/**
 * Remove leading and trailing punctuation from a potential url.
 * Note: most punctuation is technically legal in urls. However, we parse potential
 * URLs out of free-form text, where they are often followed by commas or periods,
 * or enclosed in quotes or parantheses. Most URLs don't end in such punctuation,
 * and we will fail to match these URLs without stripping the extraneous characters.
 * @param {string} token - text to have punctuation stripped
 * @returns {string} - the token with leading and trailing punctuation stripped.
 * @private
 */
function stripToken(token) {
    token = token.replace(/[.,'")(]+$/, "");
    token = token.replace(/^[.,'")(]+/, "");
    return token;
}
