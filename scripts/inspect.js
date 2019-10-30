const domains = new Set(["nyti.ms", "www.washingtonpost.com", "www.theguardian.com", "www.cnn.com", "www.bbc.com"])

function unique(array, propertyName) {
   return array.filter((e, i) => array.findIndex(a => a[propertyName] === e[propertyName]) === i);
}

function getNewsLinks() {
    var news = new Array();
    for(let link of document.links) {
        if (domains.has(link.hostname)) {
            news.push({
                "domain" : link.hostname,
                "url" : link.href
            });
        }
    }
    return unique(news, 'url');
}

$(document).ready(function () {
    //document.body.style.background = 'green!20';
    let newslinks = getNewsLinks();
    for (let x of newslinks) {
        alert(x.url);
    }
    alert("document referrer " + document.referrer);
});

//function callback(mutationList, observer) {
//}

//var targetNode = document.querySelector("body");
//var observerOptions = {
  //childList: true,
  //subtree: true //Omit or set to false to observe only changes to the parent node.
//}

function realText(elem) {
    if (elem instanceof Text) {
        return elem.textContent;
    }
    const visibleText = [...elem.childNodes]
        .filter(elem => elem instanceof Text || window.getComputedStyle(elem, "").display !== 'none')
        .flatMap(elem => realText(elem))
        .join('')
    return visibleText
}
function isSponsored(elem) {
    return elem && realText(elem).toLowerCase().startsWith('sponsored')
}
function isArticleSponsored(elem) {
    return isSponsored(elem.querySelector('div[id^=feed_subtitle]'))
}

const domInsertionObserver = new MutationObserver(function(mutationsList){
        var removenodes = [...mutationsList]
            .filter(mutation => mutation.type === 'childList' && mutation.addedNodes.length)
            .flatMap(mutation => [...mutation.addedNodes])
            .filter(addedNode => addedNode.nodeName == 'ARTICLE');
    if (removenodes.length > 0) {
        alert("number of nodes " + removenodes.length);
    }
    });
    domInsertionObserver.observe(document, { childList: true, subtree: true });

//var observer = new MutationObserver(callback);
//observer.observe(document, observerOptions);