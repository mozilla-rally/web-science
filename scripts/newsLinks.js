const domains = new Set(["nyti.ms", "www.washingtonpost.com", "www.theguardian.com", "www.cnn.com", "www.bbc.com", "github.com"])

function unique(array, propertyName) {
   return array.filter((e, i) => array.findIndex(a => a[propertyName] === e[propertyName]) === i);
}

function isHrefNewsLink(href) {
            for(let d of domains) {
                if(href.indexOf(d) > -1) {
                    return true;
                }
            }
            return false;
}
function getNewsLinks(doc) {
    var news = new Array();
    for(let link of doc.links) {
        if (domains.has(link.hostname)) {
            news.push({
                "target" : link.hostname,
                "url" : decode(link.href),
                "host": window.location.host
            });
        }
        if (isHrefNewsLink(link.href)) {
            news.push({
                "target" : link.hostname,
                "url" : decode(link.href),
                "host": window.location.host
            });

        }
    }
    return unique(news, 'url');
}