/**
 * @file Sample analysis script
 * @module WebScience.Measurements.AnalysisTemplate
 */

/**
 * instance of indexedDB database
 * @type {IDBDatabase} 
 * @private
 */
let db;

/**
 * Event handler for messages from the main thread
 * On receiving "run" trigger, it waits for 5 seconds and tries to open an
 * indexed database. The wait is used to simulate intense computation. It shows
 * that the main thread is not blocked. At the end of timeout, a result object
 * is created and communicated back to the main thread.
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

const _MS_PER_DAY = 1000 * 60 * 60 * 24;
const _MAX_DATE = 8640000000000000;

const functionMapping = {
    "WebScience.Measurements.SocialMediaAccountExposure": socialMediaAccountExposureStats,
    "WebScience.Measurements.SocialMediaNewsExposure": socialMediaNewsExposureStats,
    "WebScience.Measurements.PageNaivgation": pageNavigationStats,
    "WebScience.Measurements.LinkExposure": linkExposureStats
}

// a and b are javascript Date objects
function utcDateDiffInDays(utc1, utc2) {
    return Math.floor((utc2 - utc1) / _MS_PER_DAY);
}

function getHostName(url) {
    var match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
    if (match != null && match.length > 2 && typeof match[2] === 'string' && match[2].length > 0) {
        return match[2];
    }
    else {
        return null;
    }
}
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


function Counter(array) {
    array.forEach(val => this[val] = (this[val] || 0) + 1);
}

function defaultDict(createValue = () => {return 0}) {
    return Proxy.revocable({}, {
        get : (obj, property) => (property in obj) ? obj[property] : createValue()
    })
}

let copyDefaultDict = function(dict) {
    let ret = {};
    Object.entries(dict).forEach(entry => {
        ret[entry[0]] = entry[1];
    })
    return ret;
}

let processCounts = function (counter, itemFunction = (key, val) => {console.log({key, val})}){
    Object.keys(counter).forEach(key => {
        itemFunction(key, counter[key]);
    })
}

function gatherStats(statsObj) {
    let overallStats = {};
    Object.entries(statsObj).forEach(entry => {
        overallStats[entry[0]] = copyDefaultDict(entry[1].proxy);
        entry[1].revoke();
    });
    return overallStats;
}
// compute page navigation stats
function pageNavigationStats(obj) {
    let stats = {};
    stats.attention_duration = defaultDict();
    stats.page_domain = defaultDict(); // key is domain and value is number of pages in that domain
    stats.page_url = defaultDict(); // key is url and value is number unique visits, multiple attentions are counted as a single visit
    stats.referrer_url = defaultDict(function() {return new Set();}); // key is referrer url and value is number of unique urls it referred
    Object.entries(obj).forEach(entry => {

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

function linkExposureStats(obj) {
    let stats = {};
    stats.source_domains = defaultDict();
    stats.source_domains_category = defaultDict();
    stats.source_urls = defaultDict();
    stats.exposed_domains = defaultDict();
    stats.exposed_urls = defaultDict();
    stats.source_first_seen = defaultDict(() => { return new Date(_MAX_DATE); });
    Object.keys(obj).forEach(key => {
        let val = obj[key];
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


function socialMediaAccountExposureStats(obj) {
    let stats = {};
    stats.account_posts = defaultDict(function () {
        return { platform: "", count: 0 };
    }); // key is account and value is number of exposed posts
    Object.entries(obj).forEach(entry => {
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
function socialMediaNewsExposureStats(obj) {
    let stats = {};
    stats.source_counts = defaultDict();
    Object.entries(obj).forEach(entry => {
        let val = entry[1];
        stats.source_counts.proxy[val.type] += 1;
    })
    return gatherStats(stats);
}