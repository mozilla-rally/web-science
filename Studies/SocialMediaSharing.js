import { localforage } from "/WebScience/dependencies/localforagees6.min.js"
import * as WebScience from "/WebScience/WebScience.js"
var debugLog = WebScience.Utilities.DebugLog.debugLog;

/* SocialMediaSharing - This module is used to run studies that track the user's
   social media sharing of links. */

// Storage spaces for navigation studies
var storage = {
  shares: null, // key-value store for information about page loads
  configuration: null // key-value store for study state
};

// Helper function to set up the storage spaces
async function initializeStorage() {
  await localforage.config({
      driver: [localforage.INDEXEDDB,
               localforage.WEBSQL,
               localforage.LOCALSTORAGE],
  });

  storage.shares = await localforage.createInstance( { name: "socialMediaSharing.shares" } );
  storage.configuration = await localforage.createInstance( 
      { name: "socialMediaSharing.configuration" } );
}

/* runStudy - Starts a SocialMediaSharing study. Note that only one study is supported
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

  await initializeStorage();

  const urlMatcher = new WebScience.Utilities.Matching.UrlMatcher(domains);

  // Use a unique identifier for each webpage the user visits
  var nextShareId = await storage.configuration.getItem("nextShareId");
  if(nextShareId == null) {
    nextShareId = 0;
    await storage.configuration.setItem("nextShareId", nextShareId);
  }

  // TODO when saving a sharing event, check in the browser history for whether
  // the user has visited the URL
  // Probably the best way to do this is parse the URL, strip out HTTP/HTTPS and
  // parameters, and then use browser.history.search to get whether the page
  // was visited, how many times it was visited, and when it was most recently
  // visited
  // We might also want to check the WebScience.Navigation database to look up
  // how long the user spent on the page

  // Twitter

  // If the user POSTS a status update, parse it for matching URLs
  browser.webRequest.onBeforeRequest.addListener((requestDetails) => {
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
    console.log("Tweet tokens: " + JSON.stringify(tweetTokens))

    // If there's a URL match, record the sharing event
    for (var tweetToken of tweetTokens) {
      if (urlMatcher.testUrl(tweetToken)) {
        var shareRecord = createShareRecord(shareTime, "twitter", tweetToken, "tweet");
        storage.shares.setItem("" + nextShareId, shareRecord);
        nextShareId = nextShareId + 1;
        storage.configuration.setItem("nextShareId", nextShareId);
        debugLog("Twitter share: " + JSON.stringify(shareRecord));
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

  // Facebook

  // TODO implement post support
  // Looks like the relevant API endpoint is https://www.facebook.com/webgraphql/mutation/?doc_id=...
  // Will have to check the form body's variables.input.message.text (for post
  // text) and variables.input.attachments (for attached URLs)

  // TODO implement reshare support

  // Reddit

  // If the user POSTs a new post, parse it for matching URLs
  browser.webRequest.onBeforeRequest.addListener((requestDetails) => {
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
          storage.shares.setItem("" + nextShareId, shareRecord);
          nextShareId = nextShareId + 1;
          storage.configuration.setItem("nextShareId", nextShareId);
          debugLog("Reddit post: " + JSON.stringify(shareRecord));
        }
    }

    // TODO handle if there's a URL embedded in the post body

  },
  // Using a wildcard at the end of the URL because Reddit adds parameters
  { urls: [ "https://oauth.reddit.com/api/submit*" ] }, 
  [ "requestBody" ]);

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
  var output = {
    "socialMediaSharing.shares": { },
    "socialMediaSharing.configuration": { }
  };
  await storage.shares.iterate((value, key, iterationNumber) => {
    output["socialMediaSharing.pages"][key] = value;
  });
  await storage.configuration.iterate((value, key, iterationNumber) => {
    output["socialMediaSharing.configuration"][key] = value;
  });
  return output;
}
