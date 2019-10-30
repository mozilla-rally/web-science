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
                "domain" : link.hostname,
                "url" : link.href
            });
        }
        if (isHrefNewsLink(link.href)) {
            news.push({
                "domain" : link.hostname,
                "url" : link.href
            });

        }
    }
    return unique(news, 'url');
}