import * as PageNavigation from "../WebScience/Measurements/PageNavigation";

// do something with the page data output.

function onPageData(data) {
    console.debug('OUTPUT', data);
}

// what I WANT to do is capture other data points in some way;
// - from the background script, register other ones.
// - from the content script, register how the other data is captured.

PageNavigation.onPageData.addListener(onPageData, {
    matchPatterns: ["<all_urls>"],
    privateWindows: false
});