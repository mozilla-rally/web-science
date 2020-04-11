/**
 * @param {string} tweet_id - the numerical ID of the tweet to retrieve
 * @returns {Promise} - matching urls
 */
function getTweetContent(tweetId, x_csrf_token, authorization) {
    return new Promise((resolve, reject) => {
        var headers = new Headers();
        headers.append("x-csrf-token", x_csrf_token);
        headers.append("authorization", authorization);
        var reqString = `https://api.twitter.com/2/timeline/conversation/${tweetId}.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_composer_source=true&include_ext_alt_text=true&include_reply_count=1&tweet_mode=extended&include_entities=true&include_user_entities=true&include_ext_media_color=true&include_ext_media_availability=true&send_error_codes=true&simple_quoted_tweets=true&count=20&ext=mediaStats%2CcameraMoment`;
        fetch(reqString,
            {headers: headers, credentials: 'include'}).then(async (responseFromFetch) => {
                responseFromFetch.json().then(async (response) => {
                    resolve(response);
                });
            });
    });
}

/**
 * Listen for the background page to request tweet contents.
 */
browser.runtime.onMessage.addListener(request => {
    var response = { urlsInMediaBox: [], urlsInPostBody: [] };
    var resp = getTweetContent(request.tweetId, request.x_csrf_token, request.authorization);
    return Promise.resolve(resp);
});
