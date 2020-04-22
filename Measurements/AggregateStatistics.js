/**
 * @file Script for computing aggregate statistics
 * @module WebScience.Measurements.AggregateStatistics
 */

/**
 * Event handler for messages from the main thread
 * On receiving data, the function computes aggregate statistics and 
 * sends a message back to the caller with the result object.
 * 
 * @param {MessageEvent} event - message object
 * @listens MessageEvent
 */
onmessage = event => {
    let data = event.data;
    let stats = {};
    Object.entries(data).forEach(entry => {
        let key = entry[0];
        let storageObj = entry[1];
        let aggregrateStats = (key in functionMapping) ? functionMapping[key](storageObj) : {};
        stats[key] = aggregrateStats;
    });
    sendMessageToCaller("stats ", stats);
}

  /**
   * Error handler
   * @param {ErrorEvent} event - error object
   * @listens ErrorEvent
   */
  onerror = event => {
    console.error(event.message);
  }

  /**
   * Sends messages to the main thread that spawned this worker thread.
   * Each message has a type property for the main thread to handle messages.
   * The data property in the message contains the data object that the worker
   * thread intends to send to the main thread. 
   * 
   * @param {string} messageType message type
   * @param {Object} data data to be sent
   */
  function sendMessageToCaller(messageType, data) {
      postMessage({
          type: messageType,
          data: data
      });
  }

/**
* Functions for computing statistics 
*/

/**
 * The number of seconds in a day.
 * @private
 * @const {number}
 * @default
 */
const _MS_PER_DAY = 1000 * 60 * 60 * 24;
/**
 * Maximum date supported. Used in computing the earliest
 * date from a list of date objects.
 * @private
 * @const {number}
 * @default
 */
const _MAX_DATE = 8640000000000000;

/**
 * Object that maps the type of data and the stats function to apply on 
 * data object of that type.
 * 
 * @private
 * @const {Object}
 * @default
 */
const functionMapping = {
    "WebScience.Measurements.SocialMediaAccountExposure": socialMediaAccountExposureStats,
    "WebScience.Measurements.SocialMediaNewsExposure": socialMediaNewsExposureStats,
    "WebScience.Measurements.PageNaivgation": pageNavigationStats,
    "WebScience.Measurements.LinkExposure": linkExposureStats
}

/**
 * Gets hostname from a given url string
 * 
 * @param {string} url url string
 * @returns {string|null} hostname in the input url
 */
function getHostName(url) {
    var match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
    if (match != null && match.length > 2 && typeof match[2] === 'string' && match[2].length > 0) {
        return match[2];
    }
    return null;
}


/**
 * Gets domain name from a url
 * 
 * @param {string} url url string
 * @returns {string|null} hostname in the input url
 */
function getDomain(url) {
    var hostName = getHostName(url);
    var domain = hostName;
    if (hostName != null) {
        var parts = hostName.split('.').reverse();
        if (parts != null && parts.length > 1) {
            domain = parts[1] + '.' + parts[0];
        }
    }
    return domain;
}


/**
 * Proxy wraps an empty object that intercepts the get function. When a get
 * is attempted with a missing property, the proxy returns the value of empty
 * function instead of undefined value.
 * @param {function} defaultValue - Function that returns a default value
 */
function objectWithDefaultValue(defaultValue = () => {return 0}) {
    return Proxy.revocable({}, {
        get : (obj, property) => (property in obj) ? obj[property] : defaultValue()
    })
}

/**
 * Copies properties from wrapped object into a barebones object
 * @param {Proxy} defaultValueObject - wrapped object
 */
function copyDefaultValueObject(defaultValueObject) {
    let ret = {};
    Object.entries(defaultValueObject).forEach(entry => {
        ret[entry[0]] = entry[1];
    })
    return ret;
}

/**
 * Given an object containing aggregate statistics, the function unwraps the
 * proxy object, copies the values and revokes proxy.
 * @param {Object} statsObj statistics object
 */
function gatherStats(statsObj) {
    let overallStats = {};
    Object.entries(statsObj).forEach(entry => {
        overallStats[entry[0]] = copyDefaultValueObject(entry[1].proxy);
        entry[1].revoke();
    });
    return overallStats;
}

/**
 * Function for computing page navigation statistics
 * @param {Object} pageNavigationStorage page navigation storage object
 */
function pageNavigationStats(pageNavigationStorage) {
    let stats = {};
    stats.attention_duration = objectWithDefaultValue();
    stats.page_domain = objectWithDefaultValue(); // key is domain and value is number of pages in that domain
    stats.page_url = objectWithDefaultValue(); // key is url and value is number unique visits, multiple attentions are counted as a single visit
    stats.referrer_url = objectWithDefaultValue(function() {return new Set();}); // key is referrer url and value is number of unique urls it referred
    Object.entries(pageNavigationStorage).forEach(entry => {

        let key = entry[0];
        let navObj = entry[1];
        let domain = getDomain(navObj.url);
        stats.page_domain.proxy[domain] += 1;
        stats.page_url.proxy[navObj.url] += 1;
        stats.referrer_url.proxy[navObj.referrer] = stats.referrer_url.proxy[navObj.referrer].add(navObj.url);
        let attention = 0;
        navObj.attentionSpanStarts.map((start_time, index) => {
            let end_time = navObj.attentionSpanEnds[index];
            attention += end_time - start_time;
        });
        stats.attention_duration.proxy[navObj.url] += attention
    });
    return gatherStats(stats);
}

/**
 * Function for computing link exposure statistics
 * @param {Object} linkExposureStorage page navigation storage object
 */
function linkExposureStats(linkExposureStorage) {
    let stats = {};
    stats.source_domains = objectWithDefaultValue();
    stats.source_domains_category = objectWithDefaultValue();
    stats.source_urls = objectWithDefaultValue();
    stats.exposed_domains = objectWithDefaultValue();
    stats.exposed_urls = objectWithDefaultValue();
    stats.source_first_seen = objectWithDefaultValue(() => { return new Date(_MAX_DATE); });
    Object.keys(linkExposureStorage).forEach(key => {
        let val = linkExposureStorage[key];
        if ('metadata' in val) {
            if ('location' in val.metadata) {
                let source_domain = getDomain(val.metadata.location);
                stats.source_domains.proxy[source_domain] += 1;
                stats.source_urls.proxy[val.metadata.location] += 1;
            }
            if ('domainCategory' in val.metadata) {
                stats.source_domains_category.proxy[val.metadata.domainCategory] += 1;
            }
            if ('loadTime' in val.metadata) {
                stats.source_first_seen.proxy[val.metadata.location] = Math.min(stats.source_first_seen.proxy[val.metadata.location], new Date(val.metadata.loadTime));
            }
        }
        let exposedURL = val.resolvedUrl ? 'resolvedUrl' in val : val.originalUrl;
        let exposedDomain = getDomain(exposedURL);
        stats.exposed_domains.proxy[exposedDomain] += 1;
        stats.exposed_urls.proxy[exposedURL] += 1;
    });
    return gatherStats(stats);
}


/**
 * Function for computing social media account exposure statistics
 * @param {Object} socialMediaAccountExposureStorage social media account exposure storage
 */
function socialMediaAccountExposureStats(socialMediaAccountExposureStorage) {
    let stats = {};
    stats.account_posts = objectWithDefaultValue(function () {
        return { platform: "", count: 0 };
    }); // key is account and value is number of exposed posts
    Object.entries(socialMediaAccountExposureStorage).forEach(entry => {
        let val = entry[1];
        val.posts.forEach(post => {
            stats.account_posts.proxy[post.account] = {
                platform: val.platform,
                count: stats.account_posts.proxy[post.account].count + 1
            }
        })
    });
    return gatherStats(stats);
}

/**
 * Function for computing social media news exposure statistics
 * @param {Object} socialMediaNewsExposureStorage social media news exposure storage
 */
function socialMediaNewsExposureStats(socialMediaNewsExposureStorage) {
    let stats = {};
    stats.source_counts = objectWithDefaultValue();
    Object.entries(socialMediaNewsExposureStorage).forEach(entry => {
        let val = entry[1];
        stats.source_counts.proxy[val.type] += 1;
    })
    return gatherStats(stats);
}