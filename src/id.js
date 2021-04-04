/**
 * This module provides functionality for generating random identifiers.
 * Studies can use these identifiers to uniquely label events and other
 * items of interest.
 * @module webScience.id
 */

/**
* Generate an ID, a random 128-bit value represented as a hexadecimal string.
* @returns {string} The new random ID.
*/
export function generateId() {
    const idBytes = window.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(idBytes, (byte) => {
        if(byte < 16)
            return "0" + byte.toString(16);
        return byte.toString(16);
    }).join("");
}