/**
 * This module provides utilities for logging debugging events.
 * The module currently just outputs events with `console.debug`.
 * It should eventually support debugging via Telemetry.
 *
 * @module WebScience.Utilities.Debugging
 */

import browser from 'webextension-polyfill';

/**
 * Whether to log debugging events.
 * @private
 * @type {boolean}
 * @default
 */
// FIXME unused
// let debug = false;

/** Enable logging for debugging events. */
export function enableDebugging () {
  // FIXME unused
  // debug = true;
}

/**
 * Create a debugging logger, a function that logs debugging events (as strings).
 * @param {string} moduleName - A name that uniquely identifies the module
 * generating the debugging events.
 * @returns {function(string)} - A debugging logger.
 */
export function getDebuggingLog (moduleName) {
  return (text) => {
    console.debug('WebScience.' + moduleName + ': ' + text);
  };
}

export function getExtensionVersion () {
  const manifest = browser.runtime.getManifest();
  if ('version' in manifest) return manifest.version;
  return '';
}
