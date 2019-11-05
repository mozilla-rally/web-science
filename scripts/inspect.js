$( document ).ready(function() {
    // Get unique links in the loaded page
    links = getLinks();
    var message = {type: "documentReady",
                   links: links,
                   referrer: document.referrer};
    browser.runtime.sendMessage(message);
});

function getLinks() {
    var links = new Set();
    $('a').each(function() {
        links.add(this.href)
    });
    return links;
}
