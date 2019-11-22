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
        { urls: [ "https://api.twitter.com/*/statuses/update.json" ] }, 
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
                if(domainMatcher.test(postUrl)) {
                    var shareRecord = createShareRecord(shareTime, "reddit", postUrl, "post");
                    storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                    debugLog("Reddit: " + JSON.stringify(shareRecord));
                }
            }

            // TODO handle if there's a URL embedded in the post body
            
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
