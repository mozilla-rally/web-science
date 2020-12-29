/**
 * This module provides functionality for constructing events similar to
 * WebExtensions `events.Event` objects.
 * 
 * @module WebScience.Utilities.Events
 */

import * as Debugging from "./Debugging.js"

const debugLog = Debugging.getDebuggingLog("Utilities.Events");

/**
 * A function that adds an event listener, with optional parameters. If the
 * listener has previously been added for the event, the listener's options
 * (if any) will be updated.
 * @callback addListener
 * @param {function} listener - The function to call when the event fires.
 * The argument(s) that the function will receive depend on the event type.
 * @param {Object} [options] - Options for when the listener should be called.
 * The supported option(s) depend on the event type.
 */

/**
 * A function that removes an event listener.
 * @callback removeListener
 * @param {function} listener - The listener function to remove.
 */

/**
 * A function that checks whether an event listener has been added.
 * @callback hasListener
 * @param {function} listener - The listener function to check.
 * @return {boolean} Whether the listener function has been added.
 */

/**
 * A function that determines whether to call a listener function for an event.
 * @callback filterFunction
 * @param {Array} listenerArguments - The arguments that will be passed to listener
 * functions.
 * @param {Object} options - The options that the listener was added with.
 * @return {boolean} Whether to call the listener function.
 */

 /**
  * A function that calls the listeners for an event.
  * @callback notifyListeners
  * @param {Array} listenerArguments - The arguments to pass to the listener functions.
  * @param {FilterFunction} [filter] - A function that determines whether to
  * call each listener function based on the arguments and that listener's options.
  */

/**
 * An event object similar to WebExtensions `events.Event` objects.
 * @typedef {Object} Event
 * @property {addListener} addListener
 * @property {removeListener} removeListener
 * @property {hasListener} hasListener
 * @property {notifyListeners} notifyListeners
 */

/**
 * Creates an event object similar to WebExtensions `events.Event` objects.
 * @return {Event}
 */
export function createEvent() {
    /**
    * The set of listener functions and options. Keys are listener functions,
    * values are options.
    * @private
    * @type {Map<function, *>}
    */
    let listeners = new Map();
    return {
        addListener: function(listener, options = { }) {
            listeners.set(listener, options);
        },
        removeListener: function(listener) {
            listeners.delete(listener);
        },
        hasListener: function(listener) {
            return listeners.has(listener);
        },
        notifyListeners: function(listenerArguments, filter) {
            for(let listener of listeners) {
                try {
                    if((filter === undefined) || filter(listenerArguments, options))
                        listener.apply(null, listenerArguments);
                }
                catch(error) {
                    debugLog(`Error in listener notification: ${error}`);
                }
            }
        }
    };
}