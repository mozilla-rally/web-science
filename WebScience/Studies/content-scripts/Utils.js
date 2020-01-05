/**
 * Convert relative url to abs url
 * @param {string} url 
 * 
 * @returns {string} absolute url
 */
function rel_to_abs(url) {
    /* Only accept commonly trusted protocols:
     * Only data-image URLs are accepted, Exotic flavours (escaped slash,
     * html-entitied characters) are not supported to keep the function fast */
    if (/^(https?|file|ftps?|mailto|javascript|data:image\/[^;]{2,9};):/i.test(url))
        return url; //Url is already absolute

    var base_url = location.href.match(/^(.+)\/?(?:#.+)?$/)[0] + "/";
    if (url.substring(0, 2) == "//")
        return location.protocol + url;
    else if (url.charAt(0) == "/")
        return location.protocol + "//" + location.host + url;
    else if (url.substring(0, 2) == "./")
        url = "." + url;
    else if (/^\s*$/.test(url))
        return ""; //Empty = Return nothing
    else url = "../" + url;

    url = base_url + url;
    var i = 0;
    while (/\/\.\.\//.test(url = url.replace(/[^\/]+\/+\.\.\//g, "")));

    /* Escape certain characters to prevent XSS */
    url = url.replace(/\.$/, "").replace(/\/\./g, "").replace(/"/g, "%22")
        .replace(/'/g, "%27").replace(/</g, "%3C").replace(/>/g, "%3E");
    return url;
}

// helper function for parsing fb urls
function fbShim(url) {
    var u = new URL(url);
    // this is for facebook posts
    hasU = u.searchParams.get('u') != null;
    if (hasU) {
        return u.searchParams.get("u").split('?')[0];
    }
    return "";
}

const fbRegex = /https?:\/\/l.facebook.com\/l\.php\?u=/gm;
const isFb = url => {
    return fbRegex.test(url);
};
function removeShim(url) {
    // check if the url matches shim
    if(isFb(url)) {
        return { url : fbShim(url), isShim : true};
    }
    return { url : url, isShim : false};
}
