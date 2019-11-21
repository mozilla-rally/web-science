// Class for testing whether a URL matches an array of domains
// Currently implemented with the native RegExp, which gives good performance
// We might be able to speed this up by switching to a different implementation,
// if needed (e.g., a trie or URL parsing and a set of domains)
export class UrlMatcher {
    constructor(domains, matchSubdomains = true) {
        this.domainMatcher = new RegExp(createUrlRegexString(domains, matchSubdomains));
    }

    testUrl(url) {
        return this.domainMatcher.test(url);
    }
}

// Returns a regular expression for matching URLs against an array of domains
export function createUrlRegexString(domains, matchSubdomains = true) {
    var domainMatchRE = "^(?:http|https)://" + (matchSubdomains ? "(?:[A-Za-z0-9\\-]+\\.)*" : "") + "(?:";
    for (const domain of domains)
      domainMatchRE = domainMatchRE + domain.replace(/\./g, "\\.") + "|";
    domainMatchRE = domainMatchRE.substring(0, domainMatchRE.length - 1) + ")(?:$|/.*)";
    return domainMatchRE;
}