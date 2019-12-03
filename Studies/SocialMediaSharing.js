import * as WebScience from "/WebScience/WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("SocialMediaSharing");

/*  SocialMediaSharing - This module is used to run studies that track the user's
    social media sharing of links. */

    var storage = null;

/*  runStudy - Starts a SocialMediaSharing study. Note that only one study is supported
    per extension. runStudy requires an options object with the following
    property.
        * domains - array of domains for tracking URL shares on social media (default [ ])
        * facebook - whether to track URL shares on Facebook (default false)
        * twitter - whether to track URL shares on Twitter (default false)
        * reddit - whether to track URL shares on Reddit (default false) */

export async function runStudy({
    domains = [ ],
    facebook = false,
    twitter = false,
    reddit = false
}) {

    storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.SocialMediaSharing")).initialize();

    const urlMatcher = new WebScience.Utilities.Matching.UrlMatcher(domains);

    // Use a unique identifier for each URL the user shares
    var shareIdCounter = await (new WebScience.Utilities.Storage.Counter("WebScience.Studies.SocialMediaSharing.nextShareId")).initialize();

    // TODO when saving a sharing event, check in the browser history for whether
    // the user has visited the URL
    // Probably the best way to do this is parse the URL, strip out HTTP/HTTPS and
    // parameters, and then use browser.history.search to get whether the page
    // was visited, how many times it was visited, and when it was most recently
    // visited
    // We might also want to check the WebScience.Navigation database to look up
    // how long the user spent on the page

    // Twitter
    if(twitter) {
        // If the user POSTS a status update, parse it for matching URLs
        /* Note that there's 'url' field that gets set if the user
         *  shares from, for example, a news article. However, if the user
         *  doesn't also include the url in the body of the tweet, it won't
         *  be shown in the tweet as it displays to others, so I'm not
         *  considering the 'url' field when deciding whether a user tweeted
         *  an article, just urls in the body of the tweet.
         */
        browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
            if(requestDetails.method != "POST")
                return;

            // Check that this is a recognizable status update (i.e., tweet) request
            if ((requestDetails.requestBody == null) ||
                !("formData" in requestDetails.requestBody) ||
                !("status" in requestDetails.requestBody.formData) ||
                (requestDetails.requestBody.formData["status"].length == 0))
                return;

            var shareTime = Date.now();

            // Tokenize the tweet on whitespace and check each token for a URL match
            var tweetText = requestDetails.requestBody.formData["status"][0];
            var tweetTokens = tweetText.split(/\s+/);

            // If there's a URL match, record the sharing event
            for (var tweetToken of tweetTokens) {
                if (urlMatcher.testUrl(tweetToken)) {
                    var shareRecord = createShareRecord(shareTime, "twitter", tweetToken, "tweet");
                    storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                    debugLog("Twitter: " + JSON.stringify(shareRecord));
                }
            }

        },
        // Using a wildcard for the API version in case that changes
        { urls: [
            "https://api.twitter.com/*/statuses/update.json", /* catches tweets made from twitter.com */
            "https://twitter.com/intent/tweet", /* catches tweets made via share links on websites */
                ]
        }, 
        [ "requestBody" ]);

        // TODO handle retweets
        // Looks like the relevant API endpoint is https://api.twitter.com/1.1/statuses/retweet.json
        // Will likely have to resolve the tweet getting retweeted with another API call
        // to the endpoint at https://api.twitter.com/1.1/statuses/lookup.json

        // TODO likes
        // Looks like the relevant API enpoint is https://api.twitter.com/1.1/favorites/create.json
        // Will have to resolve the tweet getting liked for any URLs

        // TODO handle quote tweets
        // Looks like quoted tweets are referenced in the attachment_url property using
        // the ordinary Twitter API
        // Will have to resolve the tweet getting quoted for any URLs
    }

    // Facebook
    if(facebook) {
        // TODO implement post support
        // Looks like the relevant API endpoint is https://www.facebook.com/webgraphql/mutation/?doc_id=...
        // Will have to check the form body's variables.input.message.text (for post
        // text) and variables.input.attachments (for attached URLs)

        // TODO implement reshare support
    }

    // Reddit
    if(reddit) {
        // If the user POSTs a new post, parse it for matching URLs
        browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
            if(requestDetails.method != "POST")
                return;

            // Check that this is a recognizable post
            if ((requestDetails.requestBody == null) || !("formData" in requestDetails.requestBody))
                return;

            var shareTime = Date.now();

            // Handle if there's a URL attached to the post
            if(("url" in requestDetails.requestBody.formData) &&
                (requestDetails.requestBody.formData["url"].length == 1)) {
                var postUrl = requestDetails.requestBody.formData["url"][0];
                if(urlMatcher.testUrl(postUrl)) {
                    var shareRecord = createShareRecord(shareTime, "reddit", postUrl, "post");
                    storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                    debugLog("Reddit: " + JSON.stringify(shareRecord));
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
            if (!("richtext_json" in requestDetails.requestBody.formData)) return;
            var postObject = JSON.parse(requestDetails.requestBody.formData["richtext_json"]);
            if (!("document" in postObject &&
                  postObject.document.length > 0 &&
                  "c" in postObject.document[0]))
              return;

            // Handle when there's a url in the post body
            var postBody = postObject.document[0].c;
            for (var element of postBody) {
                if (element.e == "link") {
                    if (urlMatcher.testUrl(element.t)) {
                        var shareRecord = createShareRecord(shareTime, "reddit", element.t, "post");
                        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                        debugLog("Reddit: " + JSON.stringify(shareRecord));
                    }
                }
            }

        },
        // Using a wildcard at the end of the URL because Reddit adds parameters
        { urls: [ "https://oauth.reddit.com/api/submit*" ] }, 
        [ "requestBody" ]);
    }
}

/* Utilities */

function createShareRecord(shareTime, platform, url, event) {
    return {
        shareTime: shareTime,
        platform: platform,
        url: url,
        event: event
    };
}

// Helper function that dumps the navigation study data as an object
export async function getStudyDataAsObject() {
    if(storage != null)
        return await storage.getContentsAsObject();
    return null;
}
