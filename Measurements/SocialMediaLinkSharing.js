/**
 * This module is used to run studies that track the user's
 * social media sharing of links.
 * 
 * @module WebScience.Measurements.SocialMediaLinkSharing
 */

import * as Debugging from "../Utilities/Debugging.js"
import * as Storage from "../Utilities/Storage.js"
import * as Matching from "../Utilities/Matching.js"
import * as PageEvents from "../Utilities/PageEvents.js"
import * as SocialMediaActivity from "../Utilities/SocialMediaActivity.js"
import * as PageNavigation from "../Measurements/PageNavigation.js"
import * as LinkResolution from "../Utilities/LinkResolution.js"
import * as PageClassification from "../Measurements/PageClassification.js"
import * as Readability from "../Utilities/Readability.js"
import * as LinkExposure from "../Measurements/LinkExposure.js"

const debugLog = Debugging.getDebuggingLog("SocialMediaLinkSharing");

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

var numUntrackedShares = {type: "numUntrackedShares", facebook: null, twitter: null, reddit: null};

var twitterPrivacySetting = "unknown";

var initialized = false;

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
    if (privateWindows) SocialMediaActivity.enablePrivateWindows();
    if (facebook) {
        SocialMediaActivity.registerFacebookActivityTracker(facebookLinks, ["post", "reshare"]);
    }
    if (reddit) {
        SocialMediaActivity.registerRedditActivityTracker(redditLinks, ["post"]);
    }
    if (twitter) {
        SocialMediaActivity.registerTwitterActivityTracker(twitterLinks, ["tweet", "retweet", "favorite"]);
    }

    storage = await (new Storage.KeyValueStorage("WebScience.Measurements.SocialMediaLinkSharing")).initialize();
    numUntrackedShares.facebook = await (new Storage.Counter(
        "WebScience.Measurements.SocialMediaLinkSharing.numUntrackedSharesFacebook")).initialize();
    numUntrackedShares.reddit = await (new Storage.Counter(
        "WebScience.Measurements.SocialMediaLinkSharing.numUntrackedSharesReddit")).initialize();
    numUntrackedShares.twitter = await (new Storage.Counter(
        "WebScience.Measurements.SocialMediaLinkSharing.numUntrackedSharesTwitter")).initialize();
    urlMatcher = new Matching.UrlMatcher(domains);
    //var sdrs = await browser.storage.local.get("shortDomainRegexString");
    var shortDomains = LinkResolution.getShortDomains();
    var shortDomainPattern = Matching.createUrlRegexString(shortDomains);
    shortDomainMatcher = new RegExp(shortDomainPattern);

    // Make this available to content scripts
    await browser.storage.local.set({ "SocialMediaLinkSharing.privateWindows": privateWindows });
    // Use a unique identifier for each URL the user shares
    shareIdCounter = await (new Storage.Counter("SocialMediaLinkSharing.nextShareId")).initialize();
    initialized = true;
}

function isTwitterLink(url) {
    var twitterLink = /twitter\.com\/[0-9|a-z|A-Z|_]*\/status\/([0-9]*)\/?$/;
    return twitterLink.exec(url);
}

async function parsePossibleTwitterQuoteTweet(twitterUrl, urlsToSave, urlsNotToSave) {
    var matchTwitter = isTwitterLink(twitterUrl);
    if (matchTwitter == null) return;
    await parseTwitterQuoteTweet(matchTwitter[1], urlsToSave, urlsNotToSave, []);
}

async function parseTwitterQuoteTweet(tweetId, urlsToSave, urlsNotToSave, tweets) {
    if (!tweetId) return;
    if (!(tweets.hasOwnProperty(tweetId))) {
        var tweets = await SocialMediaActivity.getTweetContent(tweetId);
    }

    var quoteTweetedTweet = tweets[tweetId];
    try {
        await extractRelevantUrlsFromTokens(quoteTweetedTweet.full_text.split(/\s+/),
            urlsToSave, urlsNotToSave);
    } catch {}
    try {
    for (var url of quoteTweetedTweet.entities.urls) {
        url = parseTwitterUrlObject(url);
        await extractRelevantUrlsFromTokens([url], urlsToSave, urlsNotToSave);
    }
    } catch {}
}

function parseTwitterUrlObject(urlObject) {
    try {
        if (urlObject.hasOwnProperty("expanded_url")) return urlObject.expanded_url;
        if (urlObject.hasOwnProperty("url")) return url.url;
    } catch { }
    return url;
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
    if (twitterPrivacySetting == "unknown") {
        checkTwitterAccountStatus();
    }
    var urlsToSave = [];
    var urlsNotToSave = [];
    var audience = null;
    if (details.eventType == "tweet") {
        try {
            await extractRelevantUrlsFromTokens(details.postText.split(/\s+/),
                urlsToSave, urlsNotToSave);
        } catch {}
        try {
            await parsePossibleTwitterQuoteTweet(details.postAttachments,
                urlsToSave, urlsNotToSave);
        } catch {}
        try {
            await extractRelevantUrlsFromTokens([details.postAttachments],
                urlsToSave, urlsNotToSave);
        } catch {}

    } else if (details.eventType == "retweet") {
        var retweetedTweets = await SocialMediaActivity.getTweetContent(details.retweetedId);
        var retweetedTweet = retweetedTweets[details.retweetedId];
        try {
            await extractRelevantUrlsFromTokens(retweetedTweet.full_text.split(/\s+/),
                urlsToSave, urlsNotToSave);
        } catch {}
        try {
            for (var url of retweetedTweet.entities.urls) {
                url = parseTwitterUrlObject(url);
                await extractRelevantUrlsFromTokens([url], urlsToSave, urlsNotToSave);
            }
        } catch {}
        try {
            await parseTwitterQuoteTweet(retweetedTweet["quoted_status_id_str"],
                urlsToSave, urlsNotToSave, retweetedTweets);
        } catch {}

    } else if (details.eventType == "favorite") {
        var favoritedTweets = await SocialMediaActivity.getTweetContent(details.favoritedId);
        var favoritedTweet = favoritedTweets[details.favoritedId];
        if ("retweeted_status_id_str" in favoritedTweet) {
            if (favoritedTweets.hasOwnProperty(favoritedTweet["retweeted_status_id_str"])) {
                favoritedTweet = favoritedTweets[favoritedTweet["retweeted_status_id_str"]];
            } else {
                favoritedTweets = await SocialMediaActivity.getTweetContent(
                    favoritedTweet["retweeted_status_id_str"]);
                favoritedTweet = favoritedTweets[favoritedTweet["retweeted_status_id_str"]];
            }
        }
        try {
            await extractRelevantUrlsFromTokens(favoritedTweet.full_text.split(/\s+/),
                urlsToSave, urlsNotToSave);
        } catch {}
        try {
            for (var url of favoritedTweet.entities.urls) {
                url = parseTwitterUrlObject(url);
                await extractRelevantUrlsFromTokens([url], urlsToSave, urlsNotToSave);
            }
        } catch {}
        try {
            await parseTwitterQuoteTweet(favoritedTweet["quoted_status_id_str"],
                urlsToSave, urlsNotToSave, favoritedTweets);
        } catch {}
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord({
            shareTime: details.eventTime,
            platform: "twitter",
            url: urlToSave,
            audience: twitterPrivacySetting,
            eventType: details.eventType
        });
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog("Twitter: " + JSON.stringify(shareRecord));
    }
    for (var urlNotToSave of urlsNotToSave) {
        if (!(isTwitterLink(urlNotToSave))) {
            await numUntrackedShares.twitter.increment();
        }
    }
}

/**
 * The callback for Facebook events.
 * We track posts and reshares of posts, and only care about links within them.
 * @param details - the description of the event
 */
async function facebookLinks(details) {
    var urlsToSave = [];
    var urlsNotToSave = [];
    if (details.eventType == "post") {
        var postTokens = details.postText.split(/\s+/);
        await extractRelevantUrlsFromTokens(postTokens, urlsToSave, urlsNotToSave);
        await extractRelevantUrlsFromTokens(details.postUrls, urlsToSave, urlsNotToSave);

    } else if (details.eventType == "reshare") {
        if (details.postId) {
            // in old facebook, we get the postid and need to go look it up
            var post = await SocialMediaActivity.getFacebookPostContents(details.postId);
            for (var contentItem of post.content) {
                var postTokens = contentItem.split(/\s+/);
                await extractRelevantUrlsFromTokens(postTokens, urlsToSave, urlsNotToSave);
            }
            await extractRelevantUrlsFromTokens(post.attachedUrls, urlsToSave, urlsNotToSave);
        } else {
            // in new facebook, we get the post contents and no ID
            await extractRelevantUrlsFromTokens(details.attachedUrls, urlsToSave, urlsNotToSave);
        }

    } else if (details.eventType == "react") {
        var post = await SocialMediaActivity.getFacebookPostContents(details.postId);
        for (var contentItem of post.content) {
            var postTokens = contentItem.split(/\s+/);
            await extractRelevantUrlsFromTokens(postTokens, urlsToSave, urlsNotToSave);
        }
        await extractRelevantUrlsFromTokens(post.attachedUrls, urlsToSave, urlsNotToSave);
        details.eventType = details.eventType + " " + details.reactionType;
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord({shareTime: details.eventTime,
                                                   platform: "facebook",
                                                   audience: details.audience,
                                                   url: urlToSave,
                                                   eventType: details.eventType,
                                                   source: details.source});
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog("Facebook: " + JSON.stringify(shareRecord));
    }
    for (var url of urlsNotToSave) {
        await numUntrackedShares.facebook.increment();
    }
}


/**
 * The callback for Reddit events.
 * We track posts, and only care about links within them,
 * @param details - the description of the event
 */
async function redditLinks(details) {
    var urlsToSave = [];
    var urlsNotToSave = [];
    var audience = "unknown";
    if (details.eventType == "post") {
        await extractRelevantUrlsFromTokens([details.attachment], urlsToSave, urlsNotToSave);
        for (var paragraph of details.postBody) {
            for (var content of paragraph) {
                if (content.e == "text") await extractRelevantUrlsFromTokens(content.t.split(/\s+/), urlsToSave, urlsNotToSave);
                if (content.e == "link") await extractRelevantUrlsFromTokens([content.t], urlsToSave, urlsNotToSave);
            }
        }
        if ("subredditName" in details) {
            audience = await SocialMediaActivity.checkSubredditStatus(details.subredditName);
        }
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (var urlToSave of urlsToSave) {
        var shareRecord = await createShareRecord({shareTime: details.eventTime,
                                                   platform: "reddit",
                                                   url: urlToSave,
                                                   audience: audience,
                                                   eventType: details.eventType});
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog("Reddit: " + JSON.stringify(shareRecord));
    }
    for (var urlNotToSave in urlsNotToSave) {
        await numUntrackedShares.reddit.increment();
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
async function createShareRecord({shareTime = "",
                                  platform = "",
                                  url = "",
                                  eventType = "",
                                  audience = "",
                                  source = ""}) {
    var prevVisitReferrers = await PageNavigation.logShare(url);
    var prevExposed = await LinkExposure.logShare(url);
    var historyVisits = await browser.history.search({text: url});
    var classification = await getClassificationResult(url, "pol-page-classifier");
    var type = "linkShare";
    return { type, shareTime, platform, url, eventType, classification, audience, source, prevVisitReferrers, historyVisits, prevExposed};
}

function getClassificationResult(urlToSave, workerId) {
    return new Promise((resolve, reject) => {
        PageClassification.lookupClassificationResult(urlToSave, workerId).then((result) => {
            if (result) {
                resolve(result.predicted_class);
            }
            else {
                fetchClassificationResult(urlToSave, workerId).then(resolve);
            }
        });
    });
}

function fetchClassificationResult(urlToSave, workerId) {
    return new Promise((resolve, reject) => {
        fetch(urlToSave).then((response) => {
            response.text().then((resp) => {
                var parser = new DOMParser();
                var doc = parser.parseFromString(resp, 'text/html');
                let pageContent = new Readability.Readability(doc).parse();
                var toSend = {
                    url : urlToSave,
                    title: pageContent.title,
                    text : pageContent.textContent,
                    context : {
                        timestamp : Date.now(),
                        referrer : "foo"
                    }
                }
                PageClassification.messageWorker(workerId, toSend, (result) => {
                    resolve(result.predicted_class);
                });
            });
        });
    });
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
        uniqueUrls.add(Storage.normalizeUrl(url));
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
        var resolvedUrlObj = await LinkResolution.resolveUrl(url);
        if (urlMatcher.testUrl(resolvedUrlObj.dest)) {
            return {result: true, resolvedUrl: resolvedUrlObj.dest}
        } else {
            return {result: false, resolvedUrl: resolvedUrlObj.dest}
        }
    }
    return {result:false, resolvedUrl : null};
}

function isUrl(token) {
    try { var url = new URL(token); }
    catch (_) { return false; }
    return url.protocol == "http:" || url.protocol == "https:";
}

/**
 * Filter an array of tokens into relevant urls, including resolving short urls.
 * @param {String[]} unfilteredTokens - array of tokens
 * @param {String[]} urlsToSave - an array to add the relevant urls to
 */
async function extractRelevantUrlsFromTokens(unfilteredTokens, urlsToSave, urlsNotToSave) {
    for (var unfilteredToken of unfilteredTokens) {
        if (urlMatcher.testUrl(unfilteredToken)) {
            urlsToSave.push(unfilteredToken);
        } else {
            var resolved = await checkShortUrl(unfilteredToken);
            if (resolved.result) {
                urlsToSave.push(resolved.resolvedUrl);
            } else if (resolved.resolvedUrl) {
                urlsNotToSave.push(resolved.resolvedUrl);
            } else {
                if (isUrl(unfilteredToken)) {
                    urlsNotToSave.push(unfilteredToken);
                }
            }
        }
    }
}

function checkTwitterAccountStatus() {
    fetch("https://twitter.com", {credentials: "include"}).then((response) => {
        response.text().then(resp => {
            var protectedIndex = resp.indexOf("\"protected\"");
            var isProtected = "";
            if (protectedIndex > 0) {
                isProtected = resp.substring(protectedIndex + 12, protectedIndex + 17);
            }
            if (isProtected.indexOf("true") > -1) twitterPrivacySetting = "restricted";
            else if (isProtected.indexOf("false") > -1) twitterPrivacySetting = "public";
        });
    });
}

export async function storeAndResetUntrackedShareCounts() {
    if (initialized) {
        await storage.set("WebScience.Measurements.SocialMediaLinkSharing.untrackedShareCounts", 
            {type: "numUntrackedShares",
             facebook: await numUntrackedShares.facebook.getAndReset(),
             reddit: await numUntrackedShares.reddit.getAndReset(),
             twitter: await numUntrackedShares.twitter.getAndReset()
            });
    }
}
