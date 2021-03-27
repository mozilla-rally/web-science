/**
 * This module provides utilities for working with content scripts.
 * 
 * @module webScience.utilities.contentScripts
 */

/**
 * Unpacks a content script represented as a data URL, with base64 encoding, to
 * a string containing the content script. Useful for working with content
 * scripts that have been encoded with `@rollup/plugin-url`.
 * @param {string} dataUrl - The data URL.
 * @returns {string} - The content script.
 */
export function unpack(dataUrl) {
    return atob(dataUrl.slice("data:application/javascript;base64,".length));
}