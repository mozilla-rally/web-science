/**
 * Content script for the `linkResolution` module that parses links from Google News pages.
 * This parsing is fragile and, by design, degrades gracefully to resolving links with
 * HTTP requests.
 * @module webScience.linkResolution.googleNews.content
 */

import { Base64 } from "js-base64";

/**
 * Attempt to parse the destination URL from an anchor element where the href
 * is a Google News article link. This function relies on the `jslog` attribute
 * of the anchor element or a parent article tag.
 * @param {HTMLAnchorElement} anchorElement - The anchor element.
 * @returns {string|null} The parsed destination URL, or null if parsing was not
 * successful.
 */
function parseDestinationUrl(anchorElement) {
    const elements = new Set([ anchorElement ]);
    // Consider the parent element if it's an article tag, since previously
    // jslog was set on that element instead of the anchor element
    if(anchorElement.parentElement.tagName === "ARTICLE") {
        elements.add(anchorElement.parentElement);
    }
    for(const element of elements) {
        // The destination URL is typically available in a jslog attribute,
        // which is a list of properties separated by "; ". When the URL has
        // a "2:" prepended, it's just the raw URL. When the URL has a "5:"
        // prepended, it's an array encoded with Base64 where one entry is
        // the URL. The URL can have unicode characters encoded.
        const jsLogAttributeValue = element.getAttribute("jslog");
        if(jsLogAttributeValue === null) {
            continue;
        }
        const jsLogTokens = jsLogAttributeValue.split("; ");
        for (const jsLogToken of jsLogTokens) {
            if(jsLogToken.startsWith("2:")) {
                try {
                    const urlObj = new URL(decodeURIComponent(jsLogToken.substring(2)));
                    return urlObj.href;
                }
                catch {
                    continue;
                }
            }
            else if(jsLogToken.startsWith("5:")) {
                try {
                    // We have to use a third-party Base64 decoder rather than the built-in
                    // atob function because the string might include encoded Unicode
                    // characters, which cause an error in atob.
                    const decodedJsLog = Base64.decode(jsLogToken.substring(2));
                    const values = JSON.parse(`{ "values": ${decodedJsLog} }`).values;
                    if(!Array.isArray(values)) {
                        continue;
                    }
                    for(const value of values) {
                        if(typeof value === "string") {
                            const urlObj = new URL(decodeURIComponent(value));
                            return urlObj.href;
                        }
                    }
                }
                catch {
                    continue;
                }
            }
        }
    }
    return null;
}

function pageManagerLoaded() {
    const pageManager = window.webScience.pageManager;

    const urlMappings = [ ];

    // Iterate through all the anchor elements in the document, and for each element with a Google News
    // article href, try to parse the URL
    const anchorElements = document.querySelectorAll("a[href]");
    for(const anchorElement of anchorElements) {
        try {
            const urlObj = new URL(anchorElement.href, window.location.href);
            if((urlObj.hostname === "news.google.com") && urlObj.pathname.startsWith("/articles/")) {
                const destinationUrl = parseDestinationUrl(anchorElement);
                if(destinationUrl !== null) {
                    urlMappings.push({
                        sourceUrl: urlObj.href,
                        destinationUrl,
                        ignoreSourceUrlParameters: true
                    });
                }
            }
        }
        catch {
            continue;
        }
    }

    // Notify the background script
    if(urlMappings.length > 0) {
        browser.runtime.sendMessage({
            type: "webScience.linkResolution.registerUrlMappings",
            pageId: pageManager.pageId,
            urlMappings
        });
    }
}

// Wait for pageManager load
if (("webScience" in window) && ("pageManager" in window.webScience))
    pageManagerLoaded();
else {
    if(!("pageManagerHasLoaded" in window))
        window.pageManagerHasLoaded = [];
    window.pageManagerHasLoaded.push(pageManagerLoaded);
}
