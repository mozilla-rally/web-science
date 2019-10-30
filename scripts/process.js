function findNews (doc) {
  var ns = getNewsLinks(doc);
  alert("Number of news links "+ ns.length);
}
// find news links
findNews(document);

const observer = new MutationObserver((mutations) => {
  //alert("mutations");
  mutations.forEach((mutation) => {
    if (mutation.addedNodes && mutation.addedNodes.length > 0) {
      // This DOM change was new nodes being added. Run our substitution
      // algorithm on each newly added node.
      for (let i = 0; i < mutation.addedNodes.length; i++) {
        const newNode = mutation.addedNodes[i];
        if(newNode.hasChildNodes()) {
          var list = newNode.getElementsByTagName("a");
          if(list.length > 0) {
            for(let j = 0; j < list.length; j++) {
              ref = list[j].getAttribute("href");
              if(isHrefNewsLink(ref)) {
                alert("Mutation added a new link " + ref);
              }
            }
          }
        }
      }
    }
  });
});
observer.observe(document.body, {
  childList: true,
  subtree: true
});
