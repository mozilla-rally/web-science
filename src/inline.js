/**
 * This module provides utilities for working with inlined content.
 * 
 * @module webScience.inline
 */

/**
 * Extract the content from a data URL as a string, decoding it from Base64
 * if necessary. Useful for working with content scripts that have been
 * encoded with `@rollup/plugin-url`.
 * @param {string} dataUrl - The data URL.
 * @returns {string} - The content of the URL.
 */
export function dataUrlToString(dataUrl) {
    if(!dataUrl.startsWith("data:")) {
        throw new Error("Incorrectly formatted data URL.");
    }
    const commaIndex = dataUrl.indexOf(",");
    if(commaIndex < 0) {
        throw new Error("Incorrectly formatted data URL.");
    }
    // Not currently checking that the MIME type is valid
    const dataUrlMimeTypeAndEncoding = dataUrl.substring(0, commaIndex);
    let content = dataUrl.substring(commaIndex + 1, dataUrl.length);
    if(dataUrlMimeTypeAndEncoding.endsWith("base64")) {
        content = atob(content);
    }
    return content;
}

/**
 * Convert a data URL to a blob object URL. Useful for working with HTML
 * documents that have been encoded with `@rollup/plugin-url`.
 * @param {*} dataUrl - The data URL.
 * @returns {string} - A blob object URL.
 */
export function dataUrlToBlobUrl(dataUrl) {
    return URL.createObjectURL(new Blob([ dataUrlToString(dataUrl) ]));
}
