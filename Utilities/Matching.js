// Class for testing whether a URL matches an array of domains
// Currently implemented with the native RegExp, which gives good performance
// We might be able to speed this up by switching to a different implementation,
// if needed (e.g., a trie or URL parsing and a set of domains)
export class UrlMatcher {
    constructor(domains, matchSubdomains = true) {
        this.regExp = new RegExp(createUrlRegexString(domains, matchSubdomains));
    }

    testUrl(url) {
        return this.regExp.test(url);
    }
}

// Returns a regular expression string for matching URLs against an array of domains
export function createUrlRegexString(domains, matchSubdomains = true) {
    var urlMatchRE = "^(?:http|https)://" + (matchSubdomains ? "(?:[A-Za-z0-9\\-]+\\.)*" : "") + "(?:";
    for (const domain of domains)
        urlMatchRE = urlMatchRE + domain.replace(/\./g, "\\.") + "|";
    urlMatchRE = urlMatchRE.substring(0, urlMatchRE.length - 1) + ")(?:$|/.*)";
    return urlMatchRE;
}

// Returns an array of match patterns for matching URLs against an array of domains
export function createUrlMatchPatternArray(domains, matchSubdomains = true) {
    var matchPatterns = [ ];
    for (const domain of domains) {
        matchPatterns.push("http://" + ( matchSubdomains ? "*." : "" ) + domain + "/*");
        matchPatterns.push("https://" + ( matchSubdomains ? "*." : "" ) + domain + "/*");
    }
    return matchPatterns;
}