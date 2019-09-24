$( document ).ready(function() {
 
    // Get unique links in the loaded page
    links = getLinks();
    links.forEach(element => {
        console.log(element);
    });
});

function getLinks() {
    var links = new Set();
    $('a').each(function() {
        links.add(this.href)
    });
    return links;
}