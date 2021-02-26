/**
 * This module is used to run studies that track the user's
 * social media sharing of links.
 *
 * @module WebScience.Measurements.SocialMediaLinkSharing
 */

import * as Events from "../Utilities/Events.js"
import * as Debugging from "../Utilities/Debugging.js"
//import * as Storage from "../Utilities/Storage.js"
import * as Matching from "../Utilities/Matching.js"
import * as SocialMediaActivity from "../Utilities/SocialMediaActivity.js"
import * as LinkResolution from "../Utilities/LinkResolution.js"
/*
import * as PageClassification from "../Measurements/PageClassification.js"
import * as Readability from "../Utilities/Readability.js"
*/

const debugLog = Debugging.getDebuggingLog("SocialMediaLinkSharing");


/**
 * A UrlMatcher object for testing urls
 * @type {Object}
 * @private
 */
let destinationMatcher = null;

/**
 * A counter to give each record a unique ID
 * @type {Object}
 * @private
 */
//let shareIdCounter = null;

//const numUntrackedShares = {type: "numUntrackedShares", facebook: null, twitter: null, reddit: null};

let twitterPrivacySetting = "unknown";

/**
 * A callback function for the social media share event.
 * @callback socialMediaShareCallback
 * @param {SocialMediaShareDetails} details - Additional information about the social media share event.
 */

/**
 * Options when adding a social media share event listener.
 * @typedef {Object} SocialMediaShareOptions
 * @property {Array<string>} [matchPattern=[]] - The webpages of interest for the measurement, specified with WebExtensions match patterns.
 */

/**
 * Function to start measurement when a listener is added
 * TODO: deal with multiple listeners with different match patterns
 * @param {EventCallbackFunction} listener - new listener being added
 * @param {SocialMediaShareOptions} options - configuration for the events to be sent to this listener
 */
function addListener(listener, options) {
    startMeasurement(options);
}

/**
 * Function to end measurement when the last listener is removed
 * @param {EventCallbackFunction} listener - listener that was just removed
 */
function removeListener(listener) {
    if (!this.hasAnyListeners()) {
        stopMeasurement();
    }
}

/**
 * @type {Events.Event<socialMediaShareCallback, SocialMediaShareOptions>}
 */
export const onShare = new Events.Event({
    addListenerCallback: addListener,
    removeListenerCallback: removeListener});

/**
 * Start a social media sharing study. Note that only one study is supported per extension.
 * @param {Object} options - A set of options for the study.
 * @param {string[]} [options.domains=[]] - The domains of interest for the study.
 * @param {boolean} [options.facebook=false] - Whether to track URL shares on Facebook.
 * @param {boolean} [options.twitter=false] - Whether to track URL shares on Twitter.
 * @param {boolean} [options.reddit=false] - Whether to track URL shares on Reddit.
 */
async function startMeasurement({
    destinationMatchPatterns = [],
    facebook = false,
    twitter = false,
    reddit = false
}) {
    if (facebook) {
        SocialMediaActivity.registerFacebookActivityTracker(facebookLinks, ["post", "reshare"]);
    }
    if (reddit) {
        SocialMediaActivity.registerRedditActivityTracker(redditLinks, ["post"]);
    }
    if (twitter) {
        SocialMediaActivity.registerTwitterActivityTracker(twitterLinks, ["tweet", "retweet", "favorite"]);
    }

    /*
    numUntrackedShares.facebook = await (new Storage.Counter(
        "WebScience.Measurements.SocialMediaLinkSharing.numUntrackedSharesFacebook")).initialize();
    numUntrackedShares.reddit = await (new Storage.Counter(
        "WebScience.Measurements.SocialMediaLinkSharing.numUntrackedSharesReddit")).initialize();
    numUntrackedShares.twitter = await (new Storage.Counter(
        "WebScience.Measurements.SocialMediaLinkSharing.numUntrackedSharesTwitter")).initialize();
        */
    destinationMatcher = new Matching.MatchPatternSet(destinationMatchPatterns);
}

function stopMeasurement() {
    //TODO
}

function isTwitterLink(url) {
    const twitterLink = /twitter\.com\/[0-9|a-z|A-Z|_]*\/status\/([0-9]*)\/?$/;
    return twitterLink.exec(url);
}

async function parsePossibleTwitterQuoteTweet(twitterUrl, urlsToSave, urlsNotToSave) {
    const matchTwitter = isTwitterLink(twitterUrl);
    if (matchTwitter == null) return;
    await parseTwitterQuoteTweet(matchTwitter[1], urlsToSave, urlsNotToSave, []);
}

async function parseTwitterQuoteTweet(tweetId, urlsToSave, urlsNotToSave, tweets) {
    if (!tweetId) return;
    if (!(tweetId in tweets)) {
        tweets = await SocialMediaActivity.getTweetContent(tweetId);
    }

    const quoteTweetedTweet = tweets[tweetId];
    try {
        await extractRelevantUrlsFromTokens(quoteTweetedTweet.full_text.split(/\s+/),
            urlsToSave, urlsNotToSave);
    } catch {
        debugLog("failed extracting relevant urls from quote tweet");
    }
    try {
    for (let url of quoteTweetedTweet.entities.urls) {
        url = parseTwitterUrlObject(url);
        await extractRelevantUrlsFromTokens([url], urlsToSave, urlsNotToSave);
    }
    } catch {
        debugLog("Failed parsing/extracting urls from quote-tweeted object");
    }
}

function parseTwitterUrlObject(urlObject) {
    if ("expanded_url" in urlObject) return urlObject.expanded_url;
    if ("url" in urlObject) return urlObject.url;
    return urlObject;
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
    let urlsToSave = [];
    const urlsNotToSave = [];
    if (details.eventType == "tweet") {
        try {
            await extractRelevantUrlsFromTokens(details.postText.split(/\s+/),
                urlsToSave, urlsNotToSave);
        } catch {
            debugLog("Failed extracting urls from twitter tweet");
        }
        try {
            await parsePossibleTwitterQuoteTweet(details.postAttachments,
                urlsToSave, urlsNotToSave);
        } catch {
            debugLog("failed parsing possible quote tweet");
        }
        try {
            await extractRelevantUrlsFromTokens([details.postAttachments],
                urlsToSave, urlsNotToSave);
        } catch {
            debugLog("failed extracting urls from tweet attachment");
        }

    } else if (details.eventType == "retweet") {
        const retweetedTweets = await SocialMediaActivity.getTweetContent(details.retweetedId);
        const retweetedTweet = retweetedTweets[details.retweetedId];
        try {
            await extractRelevantUrlsFromTokens(retweetedTweet.full_text.split(/\s+/),
                urlsToSave, urlsNotToSave);
        } catch {
            debugLog("failed extracting relevant urls from retweet");
        }
        try {
            for (let url of retweetedTweet.entities.urls) {
                url = parseTwitterUrlObject(url);
                await extractRelevantUrlsFromTokens([url], urlsToSave, urlsNotToSave);
            }
        } catch {
            debugLog("failed parsing/extracting urls from retweet");
        }
        try {
            await parseTwitterQuoteTweet(retweetedTweet["quoted_status_id_str"],
                urlsToSave, urlsNotToSave, retweetedTweets);
        } catch {
            debugLog("failed parsing quote tweet from retweet");
        }

    } else if (details.eventType == "favorite") {
        let favoritedTweets = await SocialMediaActivity.getTweetContent(details.favoritedId);
        let favoritedTweet = favoritedTweets[details.favoritedId];
        try {
            if ("retweeted_status_id_str" in favoritedTweet) {
                if (favoritedTweet["retweeted_status_id_str"] in favoritedTweets) {
                    favoritedTweet = favoritedTweets[favoritedTweet["retweeted_status_id_str"]];
                } else {
                    favoritedTweets = await SocialMediaActivity.getTweetContent(
                        favoritedTweet["retweeted_status_id_str"]);
                    favoritedTweet = favoritedTweets[favoritedTweet["retweeted_status_id_str"]];
                }
            }
        } catch {
            debugLog("failed finding retweeted tweet inside favorited tweet");
        }
        await extractRelevantUrlsFromTokens(favoritedTweet.full_text.split(/\s+/),
            urlsToSave, urlsNotToSave);
        try {
            for (let url of favoritedTweet.entities.urls) {
                url = parseTwitterUrlObject(url);
                await extractRelevantUrlsFromTokens([url], urlsToSave, urlsNotToSave);
            }
        } catch {
            debugLog("failed parsing/extracting urls from favorited tweet");
        }
        try {
            await parseTwitterQuoteTweet(favoritedTweet["quoted_status_id_str"],
                urlsToSave, urlsNotToSave, favoritedTweets);
        } catch {
            debugLog("failed parsing quote tweet from favorite");
        }
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (const urlToSave of urlsToSave) {
        const shareRecord = await createShareRecord({
            shareTime: details.eventTime,
            platform: "twitter",
            url: urlToSave,
            audience: twitterPrivacySetting,
            eventType: details.eventType
        });
        onShare.notifyListeners([ {"type": "share", "value": shareRecord} ]);
        debugLog("Twitter: " + JSON.stringify(shareRecord));
    }
    let newUntracked = 0;
    for (const urlNotToSave of urlsNotToSave) {
        if (!(isTwitterLink(urlNotToSave))) {
            newUntracked++;
            //await numUntrackedShares.twitter.increment();
        }
    }
    onShare.notifyListeners([ {
        "type": "untrackedTwitter",
        "value": newUntracked }]);
    /*
    onShare.notifyListeners([ {
        "type": "untrackedTwitter",
        "value": await numUntrackedShares.twitter.get()} ]);
        */
}

/**
 * The callback for Facebook events.
 * We track posts and reshares of posts, and only care about links within them.
 * @param details - the description of the event
 */
async function facebookLinks(details) {
    let urlsToSave = [];
    const urlsNotToSave = [];
    if (details.eventType == "post") {
        const postTokens = details.postText.split(/\s+/);
        await extractRelevantUrlsFromTokens(postTokens, urlsToSave, urlsNotToSave);
        await extractRelevantUrlsFromTokens(details.postUrls, urlsToSave, urlsNotToSave);

    } else if (details.eventType == "reshare") {
        if (details.postId) {
            // in old facebook, we get the postid and need to go look it up
            const post = await SocialMediaActivity.getFacebookPostContents(details.postId);
            for (const contentItem of post.content) {
                const postTokens = contentItem.split(/\s+/);
                await extractRelevantUrlsFromTokens(postTokens, urlsToSave, urlsNotToSave);
            }
            await extractRelevantUrlsFromTokens(post.attachedUrls, urlsToSave, urlsNotToSave);
        } else {
            // in new facebook, we get the post contents and no ID
            await extractRelevantUrlsFromTokens(details.attachedUrls, urlsToSave, urlsNotToSave);
        }

    } else if (details.eventType == "react") {
        const post = await SocialMediaActivity.getFacebookPostContents(details.postId);
        for (const contentItem of post.content) {
            const postTokens = contentItem.split(/\s+/);
            await extractRelevantUrlsFromTokens(postTokens, urlsToSave, urlsNotToSave);
        }
        await extractRelevantUrlsFromTokens(post.attachedUrls, urlsToSave, urlsNotToSave);
        details.eventType = details.eventType + " " + details.reactionType;
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (const urlToSave of urlsToSave) {
        const shareRecord = await createShareRecord({shareTime: details.eventTime,
                                                   platform: "facebook",
                                                   audience: details.audience,
                                                   url: urlToSave,
                                                   eventType: details.eventType,
                                                   source: details.source});
        onShare.notifyListeners([ {"type": "share", "value": shareRecord} ]);
        debugLog("Facebook: " + JSON.stringify(shareRecord));
    }
    //await numUntrackedShares.facebook.incrementBy(urlsNotToSave.size);
    onShare.notifyListeners([ {
        "type": "untrackedFacebook",
        "value": urlsNotToSave.size }]);//await numUntrackedShares.facebook.get()} ]);
}


/**
 * The callback for Reddit events.
 * We track posts, and only care about links within them,
 * @param details - the description of the event
 */
async function redditLinks(details) {
    let urlsToSave = [];
    const urlsNotToSave = [];
    let audience = "unknown";
    if (details.eventType == "post") {
        await extractRelevantUrlsFromTokens([details.attachment], urlsToSave, urlsNotToSave);
        for (const paragraph of details.postBody) {
            for (const content of paragraph) {
                if (content.e == "text") await extractRelevantUrlsFromTokens(content.t.split(/\s+/), urlsToSave, urlsNotToSave);
                if (content.e == "link") await extractRelevantUrlsFromTokens([content.t], urlsToSave, urlsNotToSave);
            }
        }
        if ("subredditName" in details) {
            audience = await SocialMediaActivity.checkSubredditStatus(details.subredditName);
        }
    }
    urlsToSave = deduplicateUrls(urlsToSave);
    for (const urlToSave of urlsToSave) {
        const shareRecord = await createShareRecord({shareTime: details.eventTime,
                                                   platform: "reddit",
                                                   url: urlToSave,
                                                   audience: audience,
                                                   eventType: details.eventType});
        onShare.notifyListeners([ {"type": "share", "value": shareRecord} ]);
        debugLog("Reddit: " + JSON.stringify(shareRecord));
    }
    //await numUntrackedShares.reddit.incrementBy(urlsNotToSave.size);
    onShare.notifyListeners([ {
        "type": "untrackedReddit",
        "value": urlsNotToSave.size }]);//await numUntrackedShares.reddit.get()} ]);
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
    //let prevVisitReferrers = await PageNavigation.logShare(url);
    //let prevExposed = await LinkExposure.logShare(url);
    const historyVisits = await browser.history.search({text: url});
    /*
    const polClassification = await getClassificationResult(url, "pol-page-classifier");
    const covClassification = await getClassificationResult(url, "covid-page-classifier");
    const classifierResults = {'pol-page-classifier': polClassification,
                               'cov-page-classifier': covClassification};
                               */
    const type = "linkShare";
    return { type, shareTime, platform, url, eventType,/* classifierResults,*/
             audience, source, historyVisits };
}

/*
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
                const parser = new DOMParser();
                const doc = parser.parseFromString(resp, 'text/html');
                const pageContent = new Readability.Readability(doc).parse();
                const toSend = {
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
*/

/**
 * Normalize urls by stripping url parameters and then remove duplicates
 * @param {string[]} urls - the urls to normalize and deduplicate
 * @returns {Set} - unique normalized urls
 */
function deduplicateUrls(urls) {
    const uniqueUrls = new Set();
    for (const url of urls) {
        uniqueUrls.add(Matching.normalizeUrl(url));
    }
    return uniqueUrls;
}

/**
 * Check whether a given token is a known short url, and resolve if so.
 * @param {string} url - a token that might be a short url
 * @return {string} - the resolved short url, or the original token if it was not a short url
 */
async function expandShortUrl(token) {
    try {
        if (LinkResolution.urlShortenerRegExp.test(token)) {
            const resolved = await LinkResolution.resolveUrl(token)
            if (resolved && resolved.dest) return resolved.dest;
        }
        return token;
    } catch {
        return token;
    }
}


function isUrl(token) {
    let url;
    try { url = new URL(token); }
    catch (_) { return false; }
    return url.protocol == "http:" || url.protocol == "https:";
}

/**
 * Filter an array of tokens into relevant urls, including resolving short urls.
 * @param {String[]} unfilteredTokens - array of tokens
 * @param {String[]} urlsToSave - an array to add the relevant urls to
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
 * @return {string} - the token with leading and trailing punctuation stripped.
 */
function stripToken(token) {
    token = token.replace(/[.,'")(]+$/, "");
    token = token.replace(/^[.,'")(]+/, "");
    return token;
}

/*
async function storeUntrackedShareCounts() {
    if (initialized) {
        onShare.notifyListeners(
        await storage.set("WebScience.Measurements.SocialMediaLinkSharing.untrackedShareCounts",
            {type: "numUntrackedShares",
             facebook: await numUntrackedShares.facebook.get(),
             reddit: await numUntrackedShares.reddit.get(),
             twitter: await numUntrackedShares.twitter.get()
            });
    }
}
*/
