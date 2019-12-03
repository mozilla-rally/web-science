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
    domains = [],
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
    if (twitter) {
        // If the user POSTS a status update, parse it for matching URLs
        /* When the user tweets from the share button on a website, there's a
         *  'url' field in the request that has the url of the story in it.
         * However, the user also gets a chance to edit the pre-written tweet,
         *  which initially includes the headline and link. If they remove the
         *  link from the body of the tweet, Twitter seems to ignore the
         *  'url' field when displaying the tweet (ie, no news box is shown).
         * Therefore, we're ignoring the 'url' field when deciding whether
         *  the user has tweeted a link, and just looking at the body of the post.
         */
        /* Also, for considering exposure: when a link *ends* a tweet
         *  (eg: "Here's a news article! www.example.com")
         *  the link itself is not displayed as part of the tweet, but a news
         *  box is still shown. When there is text after the link,
         *  (eg "This www.example.com is a link")
         *  the link itself is displayed *and* a news box is shown.
         */
        browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
            if (requestDetails.method != "POST")
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
            {
                urls: [
                    "https://api.twitter.com/*/statuses/update.json", /* catches tweets made from twitter.com */
                    "https://twitter.com/intent/tweet", /* catches tweets made via share links on websites */
                ]
            },
            ["requestBody"]);

        // TODO handle retweets
        // Looks like the relevant API endpoint is https://api.twitter.com/1.1/statuses/retweet.json
        // Will likely have to resolve the tweet getting retweeted with another API call
        // to the endpoint at https://api.twitter.com/1.1/statuses/lookup.json

        // Handle Twitter likes
        browser.webRequest.onBeforeRequest.addListener((requestDetails) => {
            if (requestDetails.method != "POST")
                return;

            // Check that this is a recognizable favorite request
            if ((requestDetails.requestBody == null) ||
                !("formData" in requestDetails.requestBody) ||
                !("id" in requestDetails.requestBody.formData) ||
                (requestDetails.requestBody.formData["id"].length == 0))
                return;

            var favoriteTime = Date.now();

            var requestId = requestDetails.requestId;

            /* The response to the POST request for the favorite contains details about the tweet that was liked.
             * Unfortunately, that data is in the *body* of the response, not the headers, so it's trickier to get.
             * Our ResponseBody library listens for and collects together the response, and calls the 
             *  listener below once the response body comes through.
             */
            WebScience.Utilities.ResponseBody.registerResponseBodyListener(requestId, async (responseContents) => {

                var expanded_urls = [];
                // grab all the urls in the liked tweet itself
                if (("entities" in responseContents &&
                    "urls" in responseContents.entities)) {
                    for (var urlObject of responseContents.entities.urls) {
                        if ("expanded_url" in urlObject) {
                            expanded_urls.push(urlObject.expanded_url);
                        }
                    }
                }

                // if this is a retweet, grab all the urls in the original tweet
                if (("retweeted_status" in responseContents &&
                    "entities" in responseContents.retweeted_status &&
                    "urls" in responseContents.retweeted_status.entities)) {
                    for (var urlObject of responseContents.retweeted_status.entities.urls) {
                        if ("expanded_url" in urlObject) {
                            expanded_urls.push(urlObject.expanded_url)
                        }
                    }
                }

                /* TODO: probably I don't understand Twitter well enough, but sometimes the urls are
                 *  duplicated because they appear in the tweet and the retweet? Even when it doesn't
                 *  look like they're in both. Anyway, we should de-duplicate that.
                 */
                // check whether the found urls are ones we care about and report if so
                for (var expanded_url of expanded_urls) {
                    if (urlMatcher.testUrl(expanded_url)) {
                        var shareRecord = createShareRecord(favoriteTime, "twitter", expanded_url, "favorite");
                        storage.set((await shareIdCounter.getAndIncrement()).toString(), shareRecord);
                        debugLog("Twitter favorite: " + JSON.stringify(shareRecord));
                    }
                }
            }, true); // pass true to tell ResponseBody to json parse the reply for us

        },
            // Using a wildcard for the API version in case that changes
            {
                urls: [
                    "https://api.twitter.com/*/favorites/create.json", /* catches likes made from twitter.com */
                ]
            },
            ["requestBody", "blocking"]);

        // TODO handle quote tweets
        // Looks like quoted tweets are referenced in the attachment_url property using
        // the ordinary Twitter API
        // Will have to resolve the tweet getting quoted for any URLs
    }

    // Facebook
    if (facebook) {
        // TODO implement post support
        // Looks like the relevant API endpoint is https://www.facebook.com/webgraphql/mutation/?doc_id=...
        // Will have to check the form body's variables.input.message.text (for post
        // text) and variables.input.attachments (for attached URLs)

        // TODO implement reshare support
    }

    // Reddit
    if (reddit) {
        // If the user POSTs a new post, parse it for matching URLs
        browser.webRequest.onBeforeRequest.addListener(async (requestDetails) => {
            if (requestDetails.method != "POST")
                return;

            // Check that this is a recognizable post
            if ((requestDetails.requestBody == null) || !("formData" in requestDetails.requestBody))
                return;

            var shareTime = Date.now();

            // Handle if there's a URL attached to the post
            if (("url" in requestDetails.requestBody.formData) &&
                (requestDetails.requestBody.formData["url"].length == 1)) {
                var postUrl = requestDetails.requestBody.formData["url"][0];
                if (urlMatcher.testUrl(postUrl)) {
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
            { urls: ["https://oauth.reddit.com/api/submit*"] },
            ["requestBody"]);
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
    if (storage != null)
        return await storage.getContentsAsObject();
    return null;
}
