'use strict';

const _MS_PER_DAY = 1000 * 60 * 60 * 24;
const _MAX_DATE = 8640000000000000;

const functionMapping = {
    "WebScience.Measurements.SocialMediaAccountExposure": socialMediaAccountExposureStats,
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
    return new Proxy(Object.create(null), {
        get : (obj, property) => (property in obj) ? obj[property] : createValue()
    });
}


let processCounts = function (counter, itemFunction = (key, val) => {console.log({key, val})}){
    Object.keys(counter).forEach(key => {
        itemFunction(key, counter[key]);
    })
}

function gatherStats(statsObj) {
    let overallStats = {};
    Object.entries(statsObj).forEach(entry => {
        //overallStats[entry[0]] = processCounts(entry[1]);
        overallStats[entry[0]] = entry[1];
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
        stats.page_domain[domain] += 1;
        stats.page_url[navObj.url] += 1;
        stats.referrer_url[navObj.referrer] = stats.referrer_url[navObj.referrer].add(navObj.url);
        let attention = 0;
        navObj.attentionSpanStarts.map((start_time, index) => {
            let end_time = navObj.attentionSpanEnds[index];
            attention += end_time - start_time;
        });
        stats.attention_duration[navObj.url] += attention
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
                stats.source_domains[source_domain] += 1;
                stats.source_urls[val.metadata.location] += 1;
            }
            if ('domainCategory' in val.metadata) {
                stats.source_domains_category[val.metadata.domainCategory] += 1;
            }
            if ('loadTime' in val.metadata) {
                stats.source_first_seen[val.metadata.location] = Math.min(stats.source_first_seen[val.metadata.location], new Date(val.metadata.loadTime));
            }
        }
        let exposedURL = val.resolvedUrl ? 'resolvedUrl' in val : val.originalUrl;
        let exposedDomain = getDomain(exposedURL);
        stats.exposed_domains[exposedDomain] += 1;
        stats.exposed_urls[exposedURL] += 1;
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
            stats.account_posts[post.account] = {
                platform: val.platform,
                count: stats.account_posts[post.account].count + 1
            }
        })
    });
    return gatherStats(stats);
}

export async function statsFromStorageInstances(storageInstancesArr) {
    console.log("processing storage instances");
    let stats = {};
    await Promise.all(storageInstancesArr.map(async instance => {
        let key = instance.storageAreaName;
        let storageObj = await instance.getContentsAsObject();
        let aggregrateStats = (key in functionMapping) ? functionMapping[key](storageObj) : {};
        stats[key] = aggregrateStats;
    }));
    return stats;
}