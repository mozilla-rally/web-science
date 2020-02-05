/**
 * Misc set of functions used in content scripts
 * @module WebScience.Studies.content-scripts.misc
 */

/**
 * Convert relative url to abs url
 * @param {string} url 
 * @returns {string} absolute url
 */
function relativeToAbsoluteUrl(url) {
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

/**
 * Regular expression for matching urls shimmed by facebook
 * @constant
 * @type {RegExp}
 * @default
 */
const facebookUrlRegex = /https?:\/\/l.facebook.com\/l\.php\?u=/;

/**
 * Function to retrieve original url from a url shimmed by facebook
 * @see facebookUrlRegex
 * The shimmed url contains key-value pairs. Original url is stored under
 * key 'u'
 * @param {string} url - inner url if the format follows the above description empty otherwise
 */
function removeFacebookShim(url) {
    let urlObject = new URL(url);
    // this is for facebook posts
    let searchParamValue = urlObject.searchParams.get('u');
    if (searchParamValue != null) {
        return searchParamValue.split('?')[0];
    }
    return "";
}

/**
 * Removes url shim. Currently supports only facebook urls
 * @param {string} url 
 * @returns {Object} url property whose value is same as input or deshimmed url depending on whether the input is
 * matches facebook shim format. A boolean isShim property that is true if the format matches
 */
function removeShim(url) {
    // check if the url matches shim
    if(facebookUrlRegex.test(url)) {
        return { url : removeFacebookShim(url), isShim : true};
    }
    return { url : url, isShim : false};
}

/**
 * Helper function to get size of element
 * @param {Element} element element
 * @returns Object with width and height of element
 */
function getElementSize(element) {
    let rect = element.getBoundingClientRect();
    return {
        width: rect.width,
        height: rect.height
    };
}

/**
 * Helper function to check if Element is visible based on style and bounding rectangle
 * @param {Element} element element
 * @returns {boolean} true if the element is visible
 */
function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const st = window.getComputedStyle(element);
    let ret = (
        element &&
        element.offsetHeight > 0 &&
        element.offsetWidth > 0 &&
        rect &&
        rect.height > 0 &&
        rect.width > 0 &&
        st &&
        st.display && st.display !== "none" &&
        st.opacity && st.opacity !== "0"
    );
    return ret;
}