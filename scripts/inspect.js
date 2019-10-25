$( document ).ready(function() {

    localforage.config({
        driver: [localforage.INDEXEDDB,
                 localforage.WEBSQL,
                 localforage.LOCALSTORAGE],
        name: "datacollectionDB"
    });
    // Get unique links in the loaded page
    links = getLinks();
    var message = {type: "documentReady",
                   links: links,
                   referrer: document.referrer};
    browser.runtime.sendMessage(message);
    console.log("message sent");
    /*
    links.forEach(element => {
        console.log(element);
    });
    */
});

function getLinks() {
    var links = new Set();
    $('a').each(function() {
        links.add(this.href)
    });
    return links;
}
