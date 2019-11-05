// utils for content scripts

function decode(url) {
    var u = new URL(url);
    // this is for facebook posts
    hasU = u.searchParams.get('u') != null;
    if(hasU) {
        return u.searchParams.get("u").split('?')[0];
    }
    return u.href;
}

function getDomain(url) {
    return new URL(url).hostname;
}