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
 */
export async function runStudy({
    domains = [],
    facebook = false,
    twitter = false,
    reddit = false
}) {
    storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.SocialMediaSharing")).initialize();
    urlMatcher = new WebScience.Utilities.Matching.UrlMatcher(domains);
    var sdrs = await browser.storage.local.get("shortDomainRegexString");
    shortUrlMatcher = new RegExp(sdrs.shortDomainRegexString),

    // Use a unique identifier for each URL the user shares
    shareIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.SocialMediaSharing.nextShareId")).initialize();

    // TODO when saving a sharing event, check in the browser history for whether
    // the user has visited the URL
    // Probably the best way to do this is parse the URL, strip out HTTP/HTTPS and
    // parameters, and then use browser.history.search to get whether the page
    // was visited, how many times it was visited, and when it was most recently
    // visited
    // We might also want to check the WebScience.Navigation database to look up
    // how long the user spent on the page

    if (twitter) { twitterSharing(); }
    if (facebook) { await facebookSharing(); }
    if (reddit) { redditSharing(); }
}

/**
 * Register listeners to log links shared or liked on Twitter.
 * Notes:
 * - When the user tweets from the share button on a website, there's a
 *    'url' field in the request that has the url of the story in it.
 *   However, the user also gets a chance to edit the pre-written tweet,
 *    which initially includes the headline and link. If they remove the
 *    link from the body of the tweet, Twitter seems to ignore the
 *    'url' field when displaying the tweet (ie, no news box is shown).
 *   Therefore, we're ignoring the 'url' field when deciding whether
 *    the user has tweeted a link, and just looking at the body of the post.
 * - For considering exposure: when a link *ends* a tweet
 *    (eg: "Here's a news article! www.example.com")
 *    the link itself is not displayed as part of the tweet, but a news
 *    box is still shown. When there is text after the link,
 *    (eg "This www.example.com is a link")
 *    the link itself is displayed *and* a news box is shown.
 * - Still TODO with twitter:
 *  - I don't know how retweets/likes/quote-tweets made from sites other
 *     than twitter.com itself work -- I think some don't send the nice replies
 *     we're using for everything else, though, so we'll probably have to pull
 *     tweet ids out of the request and resolve them.
 *    I still think it makes sense to use the response bodies when they're available,
 *     though, since they're getting sent to the user anyway, and we get to avoid
 *     having to make our own network request to resolve the tweet contents.
 *  - We don't currently store anything if the user replies (? the little speech bubble)
 *     to a tweet with a link. Here, twitter also doesn't seem to send the nice
 *     response body, but I need to explore that more.
 *   DONE:
 *   - tweets made from twitter.com or from share buttons
 *   - likes, retweets, and quote tweets made from twitter.com
 */
function twitterSharing() {
    // If the user POSTS a status update, parse it for matching URLs
    browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
        if (!(requestDetails && requestDetails.method == "POST")) { return; }

        // Check that this is a recognizable status update (i.e., tweet)
        if (!(requestDetails.requestBody &&
            "formData" in requestDetails.requestBody &&
            "status" in requestDetails.requestBody.formData &&
            requestDetails.requestBody.formData["status"].length > 0)) {
            return;
        }

        var shareTime = Date.now();
        var urlsToSave = [];

        // Tokenize the tweet on whitespace and check each token for a URL match
        var tweetText = requestDetails.requestBody.formData["status"][0];
        var tweetTokens = tweetText.split(/\s+/);

        // If there's a URL match, record the sharing event
        for (var tweetToken of tweetTokens) {
            if (urlMatcher.testUrl(tweetToken) || shortUrlMatcher.test(tweetToken)) {
                urlsToSave.push(tweetToken);
            }
        }

        var urlsToReport = deduplicateUrls(urlsToSave);
        for (var urlToReport of urlsToReport) {
            var shareRecord = await createShareRecord(shareTime, "twitter", urlToReport, "tweet");
            storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
            debugLog("Twitter: " + JSON.stringify(shareRecord));
        }
    },
        // Using a wildcard for the API version in case that changes
        { urls: [
                "https://api.twitter.com/*/statuses/update.json", /* catches tweets made from twitter.com */
                "https://twitter.com/intent/tweet" /* catches tweets made via share links on websites */
            ] },
        ["requestBody", "blocking"]);


    // Handle retweets
    /* Note: for all of these, we're not doing much validation on the response to make
        *  sure the original request really was a retweet (or like, or quote-tweet). As far as
        *  I can tell, Twitter only uses these urls for what they're stated to be. E.g.,
        *  "unliking" a tweet is sent to favorites/destroy.json, instead of favorites/create.json
        * So, it seems like basing it on the url and the fact that it was a POST is safe enough.
        */
    browser.webRequest.onHeadersReceived.addListener((details) => {
        var retweetTime = Date.now();
        if (!(details && details.method == "POST")) { return; }

        processTwitterResponse(details).then(async urlsToReport => {
            for (var urlToReport of urlsToReport) {
                var shareRecord = await createShareRecord(retweetTime, "twitter", urlToReport, "retweet");
                storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                debugLog("Twitter retweet: " + JSON.stringify(shareRecord));
            }
        });
    },
        { urls: [ "https://api.twitter.com/*/statuses/retweet.json" /* catches retweets made from twitter.com */
            ] },
        ["responseHeaders", "blocking"]);

    // Handle favorites
    browser.webRequest.onHeadersReceived.addListener((details) => {
        var favoriteTime = Date.now();
        if (!(details && details.method == "POST")) { return; }

        processTwitterResponse(details).then(async urlsToReport => {
            for (var urlToReport of urlsToReport) {
                var shareRecord = await createShareRecord(favoriteTime, "twitter", urlToReport, "favorite");
                storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                debugLog("Twitter favorite: " + JSON.stringify(shareRecord));
            }
        });
    },
        // Using a wildcard for the API version in case that changes
        { urls: [ "https://api.twitter.com/*/favorites/create.json" /* catches likes made from twitter.com */
            ] },
        ["responseHeaders", "blocking"]);

    // Handle quote tweets
    browser.webRequest.onHeadersReceived.addListener((details) => {
        var quoteTweetTime = Date.now();
        if (!(details && details.method == "POST")) { return; }

        processTwitterResponse(details).then(async urlsToReport => {
            for (var urlToReport of urlsToReport) {
                var shareRecord = await createShareRecord(quoteTweetTime, "twitter", urlToReport, "quoteTweet");
                storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                debugLog("Twitter quote tweet: " + JSON.stringify(shareRecord));
            }
        });
    },
        // Using a wildcard for the API version in case that changes
        { urls: [ "https://api.twitter.com/*/statuses/update.json" /* catches quote tweets made from twitter.com */
            ] },
        ["responseHeaders", "blocking"]);

    // TODO
    browser.webRequest.onBeforeRequest.addListener((details) => {
        console.log(details.requestBody);
        console.log(details.requestBody.formData.tweet_id);
    }, { urls : [ "https://twitter.com/intent/like"
        ] },
    ["requestBody"]
    )
}

/**
 * Register listeners to detect and save links from Facebook posts and reshares.
 */
async function facebookSharing() {
    // Listens for Facebook posts (status updates)
    browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
        // Check that this is a recognizable status update
        if (!(requestDetails && requestDetails.method == "POST" &&
              requestDetails.requestBody &&
              requestDetails.requestBody.formData &&
              requestDetails.requestBody.formData.variables)) {
                return;
            }

        var postTime = Date.now();
        var urlsToSave = [];
        for (var variable of requestDetails.requestBody.formData.variables) {
            variable = JSON.parse(variable);

            // Check for urls in the post text itself
            if (variable && variable.input && variable.input.message && variable.input.message.text) {
                var postText = variable.input.message.text;
                var postTokens = postText.split(/\s+/);
                for (var postToken of postTokens) {
                    if (urlMatcher.testUrl(postToken) || shortUrlMatcher.test(postToken)) {
                        urlsToSave.push(postToken);
                    }
                }
            }

            // Check for urls that are attachments instead of post text
            if (variable && variable.input && variable.input.attachments) {
                for (var attachment of variable.input.attachments) {
                    var url = JSON.parse(attachment.link.share_scrape_data).share_params.urlInfo.canonical;
                    if (urlMatcher.testUrl(url) || shortUrlMatcher.test(postToken)) {
                        urlsToSave.push(url);
                    }
                }
            }
        }

        // Deduplicate (urls in post text can be attachments as well) and log all urls
        var urlsToReport = deduplicateUrls(urlsToSave);
        for (var urlToReport of urlsToReport) {
            var shareRecord = await createShareRecord(postTime, "facebook", urlToReport, "post");
            storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
            debugLog("Facebook post: " + JSON.stringify(shareRecord));
        }
    },
        // Using a wildcard at the end of the URL because Facebook adds parameters
        { urls: ["https://www.facebook.com/webgraphql/mutation/?doc_id=*"] },
        ["requestBody"]
    );

    // Register the content script that will find posts inside the page when reshares happen
    await browser.contentScripts.register({
        matches: ["https://www.facebook.com/*", "https://www.facebook.com/"],
        js: [
            { file: "/WebScience/Studies/content-scripts/Utils.js" },
            { file: "/WebScience/Studies/content-scripts/socialMediaSharing.js" }
        ],
        runAt: "document_idle"
    });
    
    // Listen for requests that look like post reshares
    // Note: the user can add text when resharing. This is recorded separately
    //  from the links in the shared post itself, because it has different meaning.
    // Consider a case where a user shares a link to fakenews.net and adds the link
    //  realnews.com while sharing -- differentiating those matters.
    browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
        // Check that this is a recognizable reshare
        if (!(requestDetails && requestDetails.method == "POST" &&
              requestDetails.requestBody)) {
            return;
        }

        var shareTime = Date.now();

        // If the user chooses "share now", the post id is in the formData and there is no message.
        // If they choose "share" or "share on a friend's timeline", it's in the url parameters instead.
        var sharedFromPostId = ""; // the ID of the original post that's being shared
        var ownerId = ""; // we need this if the main method of getting the contents doesn't work
        var newPostMessage = ""; // any content the user adds when sharing
        // Here, the ID of the poster of the original post is called sharer_id. Below, it's owner_id.
        if (requestDetails.requestBody.formData &&
            "shared_from_post_id" in requestDetails.requestBody.formData &&
            "sharer_id" in requestDetails.requestBody.formData) {
            sharedFromPostId = requestDetails.requestBody.formData.shared_from_post_id[0];
            ownerId = requestDetails.requestBody.formData.sharer_id[0];
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
        }

        // ask the content script to find links in the post contents
        browser.tabs.sendMessage(requestDetails.tabId,
            { "sharedFromPostId": sharedFromPostId, "ownerId": ownerId }).then(async (response) => {
                var urlsToSave = [];
                for (var url of response.urlsInMediaBox) {
                    if (urlMatcher.testUrl(url) || shortUrlMatcher.test(url)) {
                        urlsToSave.push(url);
                    }
                }
                for (var url of response.urlsInPostBody) {
                    if (urlMatcher.testUrl(url) || shortUrlMatcher.test(url)) {
                        urlsToSave.push(url);
                    }
                }
                var urlsToReport = deduplicateUrls(urlsToSave);
                for (var urlToReport of urlsToReport) {
                    var shareRecord = await createShareRecord(shareTime, "facebook", urlToReport, "share");
                    storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                    debugLog("Facebook share: " + JSON.stringify(shareRecord));
                }
            });

        // if the user added text to the post when sharing, check that text for links
        var addedUrlsToSave = [];
        var postTokens = newPostMessage.split(/\s+/);
        for (var postToken of postTokens) {
            if (urlMatcher.testUrl(postToken) || shortUrlMatcher.test(postToken)) {
                addedUrlsToSave.push(postToken);
            }
        }

        // Deduplicate and log the urls added to the post by the user
        var urlsToReport = deduplicateUrls(addedUrlsToSave);
        for (var urlToReport of urlsToReport) {
            var shareRecord = await createShareRecord(shareTime, "facebook", urlToReport, "share add");
            storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
            debugLog("Facebook share (added to post): " + JSON.stringify(shareRecord));
        }
    },
        // Using a wildcard at the end of the URL because Facebook sometimes adds parameters
        { urls: ["https://www.facebook.com/share/dialog/submit/*"] },
        ["requestBody"]);
}

/**
 * Register listeners to log urls shared in Reddit posts.
 */
function redditSharing() {
    // If the user POSTs a new post, parse it for matching URLs
    browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
        if (!(requestDetails && requestDetails.method == "POST")) { return; }

        // Check that this is a recognizable post
        if (!(requestDetails.requestBody && requestDetails.requestBody.formData)) { return; }

        var shareTime = Date.now();
        var urlsToSave = [];

        // Handle if there's a URL attached to the post
        if (("url" in requestDetails.requestBody.formData) &&
            (requestDetails.requestBody.formData["url"].length == 1)) {
            var postUrl = requestDetails.requestBody.formData["url"][0];
            if (urlMatcher.testUrl(postUrl) || shortUrlMatcher.test(postUrl)) {
                urlsToSave.push(postUrl);
            }
        }

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
            * Therefore, we walk through the array and check all the "link" types against the urlmatcher.
            */
        if ("richtext_json" in requestDetails.requestBody.formData) {
            var postObject = JSON.parse(requestDetails.requestBody.formData["richtext_json"]);
            if ("document" in postObject &&
                postObject.document.length > 0 &&
                "c" in postObject.document[0]) {

                // Handle when there's a url in the post body
                var postBody = postObject.document[0].c;
                for (var element of postBody) {
                    if (element.e == "link" && (urlMatcher.testUrl(element.t) || shortUrlMatcher.test(element.t))) {
                        urlsToSave.push(element.t);
                    }
                }
            }
        }

        var urlsToReport = deduplicateUrls(urlsToSave);
        for (var urlToReport of urlsToReport) {
            var shareRecord = await createShareRecord(shareTime, "reddit", urlToReport, "post");
            storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
            debugLog("Reddit post: " + JSON.stringify(shareRecord));
        }

    },
        // Using a wildcard at the end of the URL because Reddit adds parameters
        { urls: [ "https://oauth.reddit.com/api/submit*"
            ] },
        ["requestBody"]);
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
 * For quote tweets, retweets, and likes, the response body contains details about the tweet.
 * Here, we get those details, look through them for links, filter the links to the
 *  ones that map to domains we're tracking, and call the callback on the resulting
 *  array of links.
 */
function processTwitterResponse(details) {
    /* The response to the POST request for a retweet/like contains details about the tweet that was retweeted/liked.
        * Unfortunately, that data is in the *body* of the response, not the headers, so it's trickier to get.
        * Our ResponseBody library listens for and collects together the response, and calls the 
        *  listener below once the response body comes through.
        */
    return new Promise((resolve, reject) => {
        WebScience.Utilities.ResponseBody.processResponseBody(details.requestId, details.responseHeaders)
            .then((rawResponseContents) => {
                var expanded_urls = [];
                var responseContents = JSON.parse(rawResponseContents);
                // grab all urls mentioned in the tweet this response mentions
                if (("entities" in responseContents &&
                    "urls" in responseContents.entities)) {
                    for (var urlObject of responseContents.entities.urls) {
                        if ("expanded_url" in urlObject) {
                            expanded_urls.push(urlObject.expanded_url);
                        }
                    }
                }

                // if this is a retweet (or a like of a retweet), grab all the urls in the original tweet
                if (("retweeted_status" in responseContents &&
                    "entities" in responseContents.retweeted_status &&
                    "urls" in responseContents.retweeted_status.entities)) {
                    for (var urlObject of responseContents.retweeted_status.entities.urls) {
                        if ("expanded_url" in urlObject) {
                            expanded_urls.push(urlObject.expanded_url)
                        }
                    }
                }

                // if this is a quote-tweet (or a like of a quote-tweet), grab all the urls in the original tweet
                if (("quoted_status" in responseContents &&
                    "entities" in responseContents.quoted_status &&
                    "urls" in responseContents.quoted_status.entities)) {
                    for (var urlObject of responseContents.quoted_status.entities.urls) {
                        if ("expanded_url" in urlObject) {
                            expanded_urls.push(urlObject.expanded_url)
                        }
                    }
                }
                var urlsToSave = [];
                // check whether the found urls are ones we care about and report if so
                for (var expanded_url of expanded_urls) {
                    if (urlMatcher.testUrl(expanded_url) || shortUrlMatcher.test(expanded_url)) {
                        urlsToSave.push(expanded_url);
                    }
                }
                resolve(deduplicateUrls(urlsToSave));
            }, (error) => { reject(error); });
    });
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