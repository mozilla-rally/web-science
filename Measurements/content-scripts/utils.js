/**
 * Misc set of functions used in content scripts
 */

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

function removeFacebookfbclid(url) {
    var fbclidRegex = /(.*)(\?fbclid=.*)/;
    var urlResult = fbclidRegex.exec(url);
    if (urlResult) {
        return urlResult[1];
    }
    return url;
}

/**
 * Removes url shim. Currently supports only facebook urls
 * @param {string} url 
 * @returns {Object} url property whose value is same as input or deshimmed url depending on whether the input is
 * matches facebook shim format. A boolean isShim property that is true if the format matches
 */
function removeShim(url) {
    // check if the url matches shim
    if (facebookUrlRegex.test(url)) {
        return {
            url: removeFacebookfbclid(removeFacebookShim(url)),
            isShim: true
        };
    }
    return {
        url: url,
        isShim: false
    };
}
