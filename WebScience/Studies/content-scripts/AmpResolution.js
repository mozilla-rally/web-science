// Utility to resolve amp urls
// Caches : https://github.com/ampproject/amphtml/blob/master/build-system/global-configs/caches.json
const cacheDomains = ["cdn.ampproject.org", "amp.cloudflare.com", "bing-amp.com"];
const domRegex = /.*?\/{1,2}(.*?)(\.).*/gm;

/**
 * Get the encoded domain (part of url between the last / and the first .)
 * @param {string} url - get domain from amp url 
 */
function getDomainPrefix(url) {
    let match = domRegex.exec(url);
    if (match != null) {
        return match[1];
    }
    return null;
}
/**
 * Function to get publisher domain and actual url from a amp link
 * @param {string} url - the {@link url} to be resolved
 */
function resolveAmpUrl(url) {
    // 1. check if url contains any of the cacheDomains
    for (let i = 0; i < cacheDomains.length; i++) {
        let domain = cacheDomains[i];
        // Does the url contain domain
        if (url.includes(domain)) {
            // extract the domain prefix by removing protocol and cache domain suffix
            let domainPrefix = getDomainPrefix(url);
            if (domainPrefix != null) {
                //Punycode Decode the publisher domain. See RFC 3492
                //Replace any ‘-’ (hyphen) character in the output of step 1 with ‘--’ (two hyphens).
                //Replace any ‘.’ (dot) character in the output of step 2 with ‘-’ (hyphen).
                //Punycode Encode the output of step 3. See RFC 3492

                // Code below reverses the encoding
                // 1. replace - with . and -- with a -
                let domain = domainPrefix.replace("-", ".");
                // 2. replace two . with --
                domains = domain.replace("..", "--");
                domain = domain.replace("--", "-");
                // 3. get the actual url
                let split = url.split(domain);
                let sourceUrl = domain + split[1];
                let arr = url.split("/");
                return [domain, arr[0] + "//" + sourceUrl];
            }
        }
    }
    return [];
}