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
    storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.SocialMediaSharing")).initialize();
    urlMatcher = new WebScience.Utilities.Matching.UrlMatcher(domains);
    var sdrs = await browser.storage.local.get("shortDomainRegexString");
    shortUrlMatcher = new RegExp(sdrs.shortDomainRegexString),

    // Make this available to content scripts
    await browser.storage.local.set({ "WebScience.Studies.SocialMediaSharing.privateWindows": privateWindows });
    // Use a unique identifier for each URL the user shares
    shareIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.SocialMediaSharing.nextShareId")).initialize();

    if (twitter) { twitterSharing(privateWindows); }
    if (facebook) { await facebookSharing(privateWindows); }
    if (reddit) { redditSharing(privateWindows); }
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
 * - Twitter events we handle:
 *   - tweets made from twitter.com or from share buttons on websites
 *   - likes, retweets, and replies made from twitter.com
 *   - likes made from other sites
 *   - (it seems like embedded tweets don't have retweet or reply buttons)
 */
function twitterSharing(privateWindows) {
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
        await filterTokensToUrls(tweetTokens, urlsToSave);

        var urlsToReport = deduplicateUrls(urlsToSave);
        for (var urlToReport of urlsToReport) {
            var shareRecord = await createShareRecord(shareTime, "twitter", urlToReport, "tweet");
            storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
            debugLog("Twitter: " + JSON.stringify(shareRecord));
        }
    }, { urls: [ "https://twitter.com/intent/tweet" /* catches tweets made via share links on websites */
            ], incognito: (privateWindows ? null : false)
        },
        ["requestBody", "blocking"]);


    // Note: As far as I can tell, Twitter only uses these urls for what they're stated to be. E.g.,
    //  "unliking" a tweet is sent to favorites/destroy.json, instead of favorites/create.json

    // Handle retweets
    browser.webRequest.onHeadersReceived.addListener((details) => {
        var retweetTime = Date.now();
        if (!(details && details.method == "POST")) { return; }
        processTwitterResponse(details).then(urlsToReport => {
            recordTwitterUrls(urlsToReport, "retweet", retweetTime);
        });
    }, // Using a wildcard for the API version in case that changes
        { urls: [ "https://api.twitter.com/*/statuses/retweet.json" /* catches retweets made from twitter.com */
            ], incognito: (privateWindows ? null : false)
        },
        ["responseHeaders", "blocking"]);

    // Handle favorites
    browser.webRequest.onHeadersReceived.addListener((details) => {
        var favoriteTime = Date.now();
        if (!(details && details.method == "POST")) { return; }
        processTwitterResponse(details).then(urlsToReport => {
            recordTwitterUrls(urlsToReport, "favorite", favoriteTime);
        });
    }, // Using a wildcard for the API version in case that changes
        { urls: [ "https://api.twitter.com/*/favorites/create.json" /* catches likes made from twitter.com */
            ], incognito: (privateWindows ? null : false),
        },
        ["responseHeaders", "blocking"]);

    // Handle quote tweets
    browser.webRequest.onHeadersReceived.addListener((details) => {
        var tweetTime = Date.now();
        if (!(details && details.method == "POST")) { return; }
        processTwitterResponse(details).then(urlsToReport => {
            recordTwitterUrls(urlsToReport, "tweet", tweetTime);
        });
    }, // Using a wildcard for the API version in case that changes
        { urls: [ "https://api.twitter.com/*/statuses/update.json" /* catches tweets & replies made from twitter.com */
            ], incognito: (privateWindows ? null : false)
        },
        ["responseHeaders", "blocking"]);

    // Handle likes made from sites other than twitter.com
    browser.webRequest.onBeforeRequest.addListener(async (details) => {
        if (!(details && details.requestBody && details.requestBody.formData &&
              details.requestBody.formData.tweet_id)) { return; }

        var likeTime = Date.now();
        var tweet_id = details.requestBody.formData.tweet_id[0];

        var urlsToReport = getLinksFromTweet(tweet_id);
        for (var urlToReport of urlsToReport) {
            var shareRecord = await createShareRecord(likeTime, "twitter", urlToReport, "external like");
            storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
            debugLog("Twitter like (external): " + JSON.stringify(shareRecord));
        }
    }, { urls : [ "https://twitter.com/intent/like" ], incognito: (privateWindows ? null : false)
},
    ["requestBody"])
}

/**
 * Register listeners to detect and save links from Facebook posts and reshares.
 * Facebook events we handle:
 *  - Posts, shares of posts
 * To get the post contents, a content script sits on facebook.com domains.
 * We pass post IDs to the content script and it tries to find them on the page.
 * If it fails, it sends a request to Facebook and parses the reply to find the content.
 */
async function facebookSharing(privateWindows) {
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
        var unfilteredUrls = [];
        var urlsToSave = [];
        for (var variable of requestDetails.requestBody.formData.variables) {
            variable = JSON.parse(variable);

            // Check for urls in the post text itself
            if (variable && variable.input && variable.input.message && variable.input.message.text) {
                var postText = variable.input.message.text;
                var postTokens = postText.split(/\s+/);
                await filterTokensToUrls(postTokens, urlsToSave);
            }

            // Check for urls that are attachments instead of post text
            if (variable && variable.input && variable.input.attachments) {
                for (var attachment of variable.input.attachments) {
                    var url = JSON.parse(attachment.link.share_scrape_data).share_params.urlInfo.canonical;
                    unfilteredUrls.push(url);
                }
                await filterTokensToUrls(unfilteredUrls, urlsToSave);
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
        { urls: ["https://www.facebook.com/webgraphql/mutation/?doc_id=*"],
          incognito: (privateWindows ? null : false)    
        }, ["requestBody"]
    );

    // Register the content script that will find posts inside the page when reshares happen
    await browser.contentScripts.register({
        matches: ["https://www.facebook.com/*", "https://www.facebook.com/"],
        js: [
            { file: "/WebScience/Studies/content-scripts/utils.js" },
            { file: "/WebScience/Studies/content-scripts/socialMediaSharing.js" }
        ],
        //runAt: "document_idle"
        runAt: "document_start"
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
                await filterTokensToUrls(response.urlsInMediaBox, urlsToSave);
                await filterTokensToUrls(response.urlsInPostBody, urlsToSave);

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
        await filterTokensToUrls(postTokens, addedUrlsToSave);

        // Deduplicate and log the urls added to the post by the user
        var urlsToReport = deduplicateUrls(addedUrlsToSave);
        for (var urlToReport of urlsToReport) {
            var shareRecord = await createShareRecord(shareTime, "facebook", urlToReport, "share add");
            storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
            debugLog("Facebook share (added to post): " + JSON.stringify(shareRecord));
        }
    },
        // Using a wildcard at the end of the URL because Facebook sometimes adds parameters
        { urls: ["https://www.facebook.com/share/dialog/submit/*"],
          incognito: (privateWindows ? null : false)
        },
        ["requestBody"]);
}

/**
 * Register listeners to log urls shared in Reddit posts.
 */
function redditSharing(privateWindows) {
    // If the user POSTs a new post, parse it for matching URLs
    browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
        if (!(requestDetails && requestDetails.method == "POST")) { return; }

        // Check that this is a recognizable post
        if (!(requestDetails.requestBody && requestDetails.requestBody.formData)) { return; }

        var shareTime = Date.now();
        var urlsToSave = [];
        var unfilteredUrls = [];

        // Handle if there's a URL attached to the post
        if (("url" in requestDetails.requestBody.formData) &&
            (requestDetails.requestBody.formData["url"].length == 1)) {
            var postUrl = requestDetails.requestBody.formData["url"][0];
            unfilteredUrls.push(postUrl);
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
                    if (element.e == "link"){
                        unfilteredUrls.push(element.t);
                    }
                }
            }
        }
        await filterTokensToUrls(unfilteredUrls, urlsToSave);
        var urlsToReport = deduplicateUrls(urlsToSave);
        for (var urlToReport of urlsToReport) {
            var shareRecord = await createShareRecord(shareTime, "reddit", urlToReport, "post");
            storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
            debugLog("Reddit post: " + JSON.stringify(shareRecord));
        }

    },
        // Using a wildcard at the end of the URL because Reddit adds parameters
        { urls: [ "https://oauth.reddit.com/api/submit*" ],
          incognito: (privateWindows ? null : false) },
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
            .then(async (rawResponseContents) => {
                var expanded_urls = {body: [], retweeted: [], quoted: [], replied: []}
                var responseContents = JSON.parse(rawResponseContents);
                // grab all urls mentioned in the tweet this response mentions
                if ("entities" in responseContents &&
                    "urls" in responseContents.entities) {
                    for (var urlObject of responseContents.entities.urls) {
                        if ("expanded_url" in urlObject) {
                            expanded_urls.body.push(urlObject.expanded_url);
                        }
                    }
                }

                // if this is a retweet (or a like of a retweet), grab all the urls in the original tweet
                if ("retweeted_status" in responseContents &&
                    "entities" in responseContents.retweeted_status &&
                    "urls" in responseContents.retweeted_status.entities) {
                    for (var urlObject of responseContents.retweeted_status.entities.urls) {
                        if ("expanded_url" in urlObject) {
                            expanded_urls.retweeted.push(urlObject.expanded_url)
                        }
                    }
                }

                // if this is a quote-tweet (or a like of a quote-tweet), grab all the urls in the original tweet
                if ("quoted_status" in responseContents &&
                    "entities" in responseContents.quoted_status &&
                    "urls" in responseContents.quoted_status.entities) {
                    for (var urlObject of responseContents.quoted_status.entities.urls) {
                        if ("expanded_url" in urlObject) {
                            expanded_urls.quoted.push(urlObject.expanded_url)
                        }
                    }
                }

                var urlsToSave = {body : [], retweeted: [], quoted: [], replied: []};

                if ("in_reply_to_screen_name" in responseContents &&
                    responseContents.in_reply_to_screen_name &&
                    "in_reply_to_status_id_str" in responseContents &&
                    responseContents.in_reply_to_status_id_str) {
                        var screen_name = responseContents.in_reply_to_screen_name;
                        var status_id = responseContents.in_reply_to_status_id_str;
                        urlsToSave.replied = await getLinksFromTweet(status_id, screen_name);
                    }
                        
                await filterTokensToUrls(expanded_urls.body, urlsToSave.body);
                await filterTokensToUrls(expanded_urls.retweeted, urlsToSave.retweeted);
                await filterTokensToUrls(expanded_urls.quoted, urlsToSave.quoted);

                resolve({body: deduplicateUrls(urlsToSave.body),
                         retweeted: deduplicateUrls(urlsToSave.retweeted),
                         quoted: deduplicateUrls(urlsToSave.quoted),
                         replied: urlsToSave.replied});
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
/**
 * Request the content of a tweet, then filter and deduplicate the urls and return the relevant ones.
 * @param {string} tweet_id - the numerical ID of the tweet to retrieve
 * @param {string} [screen_name=jack] - screen name of the user who made the tweet. Defaults to jack, see below
 * @returns {Promise} - matching urls
 */
function getLinksFromTweet(tweet_id, screen_name = "jack") {
// Can't use the twitter API without proper authentication (logged in user isn't enough)
// The other options are using the regular (twitter.com/<user>/status/<tweet_id>) or embed (see below)
// urls. Using the 'embed' link gets us the tweet content a lot more simply.
// To use the regular or embed url, you need the username of the account that tweeted it
// (you can't just put the tweet id without a username)
// and we don't get the username in the request that gets sent.
// However, if you put the *wrong* username with a tweet id, twitter will find the right user
// and return the tweet anyway. Handy! Thanks Jack!
    return new Promise((resolve, reject) => {
        fetch(`https://publish.twitter.com/oembed?url=https://twitter.com/${screen_name}/status/${tweet_id}`).then(async (responseFromFetch) => {
            responseFromFetch.json().then(async (response) => {
                var content = response.html;
                var doc = (new DOMParser()).parseFromString(content, "text/html");
                var links = doc.querySelectorAll("a[href]")
                var unfilteredUrls = [];
                for (var link of links) {
                    unfilteredUrls.push(link.getAttribute("href"));
                }
                var urlsToSave = [];
                await filterTokensToUrls(unfilteredUrls, urlsToSave);
                resolve(deduplicateUrls(urlsToSave));
            });
        });
    });
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

/**
 * Create and save sharing events for a given type of twitter event.
 * @param {Object} urlsToReport - a collection of urls associated with this tweet
 * @param {Set} urlsToReport.body - the urls in the top-most tweet of an event
 * @param {Set} urlsToReport.retweeted - the urls inside of a tweet that was retweeted by this tweet
 * @param {Set} urlsToReport.quoted - the urls in a quoted tweet inside this tweet
 * @param {Set} urlsToReport.replied - the urls inside a tweet that this tweet is replying to
 * @param {string} type - the kind of twitter event being reported
 * @param {number} time - the timestamp for when the event happened
 */
async function recordTwitterUrls(urlsToReport, type, time) {
    for (var bodyUrlToReport of urlsToReport.body) {
        var shareRecord = await createShareRecord(time, "twitter", bodyUrlToReport, `${type} body`);
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog(`Twitter ${type}: ` + JSON.stringify(shareRecord));
    }
    for (var retweetedUrlToReport of urlsToReport.retweeted) {
        var shareRecord = await createShareRecord(time, "twitter", retweetedUrlToReport, `${type} retweeted`);
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog(`Twitter ${type}: ` + JSON.stringify(shareRecord));
    }
    for (var quotedUrlToReport of urlsToReport.quoted) {
        var shareRecord = await createShareRecord(time, "twitter", quotedUrlToReport, `${type} quoted`);
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog(`Twitter ${type}: ` + JSON.stringify(shareRecord));
    }
    for (var repliedUrlToReport of urlsToReport.replied) {
        var shareRecord = await createShareRecord(time, "twitter", repliedUrlToReport, `${type} replied`);
        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
        debugLog(`Twitter ${type}: ` + JSON.stringify(shareRecord));
    }
}