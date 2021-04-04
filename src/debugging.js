/**
 * This module provides utilities for logging debugging events.
 * The module currently just outputs events with `console.debug`.
 * 
 * @module webScience.debugging
 */

/**
 * Whether to log debugging events.
 * @private
 * @type {boolean}
 * @default
 */
let debug = false;

/** Enable logging for debugging events. */
export function enableDebugging() {
    debug = true;
}

/**
 * Create a debugging logger, a function that logs debugging events (as strings).
 * @param {string} moduleName - A name that uniquely identifies the module
 * generating the debugging events.
 * @returns {function(string)} - A debugging logger.
 */
export function getDebuggingLog(moduleName) {
    return ((text) => {
        if (debug) console.debug("webScience." + moduleName + ": " + text);
    });
}