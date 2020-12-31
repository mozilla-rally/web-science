/**
 * This module provides functionality for constructing events similar to
 * WebExtensions `events.Event` objects.
 * 
 * @module WebScience.Utilities.Events
 */

import * as Debugging from "./Debugging.js"

const debugLog = Debugging.getDebuggingLog("Utilities.Events");

/** A class that provides an event API similar to WebExtensions `events.Event` objects. */
export class Event {
    /**
     * Creates an event instance similar to WebExtensions `events.Event` objects.
     * @param {Object} [options] - A set of options for the event.
     * @param {addListenerCallback} [options.addListenerCallback] - A function that is
     * called when a listener function is added.
     * @param {removeListenerCallback} [options.removeListenerCallback] - A function
     * that is called when a listener function is removed.
     * @param {notifyListenersCallback} [options.notifyListenersCallback] - A function
     * that is called before a listener is notified and can filter the notification.
     */
    constructor({
        addListenerCallback = null,
        removeListenerCallback = null,
        notifyListenersCallback = null
    } = {
        addListenerCallback: null,
        removeListenerCallback: null,
        notifyListenersCallback: null
    }) {
        this.addListenerCallback = addListenerCallback;
        this.removeListenerCallback = removeListenerCallback;
        this.notifyListenersCallback = notifyListenersCallback;
        this.listeners = new Map();
    }

    /**
     * @callback addListenerCallback
     * @param {function} listener - The new listener function.
     * @param {Object} options - The options for the new listener function.
     */

    /**
     * A function that adds an event listener, with optional parameters. If the
     * listener has previously been added for the event, the listener's options
     * (if any) will be updated.
     * @param {function} listener - The function to call when the event fires.
     * @param {Object} [options={}] - Options for when the listener should be called.
     * The supported option(s) depend on the event type.
     */
    addListener(listener, options = { }) {
        if(this.addListenerCallback !== null)
            this.addListenerCallback(listener, options);
        this.listeners.set(listener, options);
    }

    /**
     * @callback removeListenerCallback
     * @param {function} listener - The listener function to remove.
     */

    /**
     * A function that removes an event listener.
     * @param {function} listener - The listener function to remove.
     */
    removeListener(listener) {
        if(this.removeListenerCallback !== null)
            this.removeListenerCallback(listener);
        this.listeners.delete(listener);
    }

    /**
     * A function that checks whether an event listener has been added.
     * @param {function} listener - The listener function to check.
     * @return {boolean} Whether the listener function has been added.
     */
    hasListener(listener) {
        return this.listeners.has(listener);
    }

    /**
     * @callback notifyListenersCallback
     * @param {Array} listenerArguments - The arguments that will be passed to the listener
     * function.
     * @param {Object} options - The options that the listener was added with.
     * @return {boolean} Whether to call the listener function.
     */

    /**
     * Notify the listener functions for the event.
     * @param {Array} listenerArguments - The arguments that will be passed to listener
     * functions.
     */
    notifyListeners(listenerArguments) {
        this.listeners.forEach((options, listener) => {
            try {
                if((this.addListenerCallback === null) || this.addListenerCallback(listenerArguments, options))
                    listener.apply(null, listenerArguments);
            }
            catch(error) {
                debugLog(`Error in listener notification: ${error}`);
            }
        });
    }
}
