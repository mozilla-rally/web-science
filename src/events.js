/**
 * This module provides functionality for constructing events similar to
 * WebExtensions `events.Event` objects.
 *
 * @module events
 */

import * as debugging from "./debugging.js";

/**
 * @constant {debugging.debuggingLogger}
 * @private
 */
const debugLog = debugging.getDebuggingLog("events");

/**
 * A callback function that is called immediately before a listener is added.
 * @callback addListenerCallback
 * @param {Function} listener - The listener that is being added.
 * @param {Object} options - The options for the listener.
 */

/**
 * A callback function that is called immediately after a listener is removed.
 * @callback removeListenerCallback
 * @param {Function} listener - The listener that was removed.
 * @param {Object} options - The options that the listener was added with.
 */

/**
 * A callback function that is called when a listener may be notified via
 * `notifyListeners()`.
 * @callback notifyListenersCallback
 * @param {Function} listener - The listener that may be called.
 * @param {Array} listenerArguments - The arguments that would be passed to the listener
 * function.
 * @param {Options} options - The options that the listener was added with.
 * @returns {boolean} Whether to call the listener.
 */

/**
 * A class that provides an event API similar to WebExtensions `events.Event` objects.
 * Use the `createEvent` function to create an `Event` object.
 * @hideconstructor
 */
class Event {
    /**
     * Creates an event instance similar to WebExtensions `events.Event` objects.
     * @param {Object} [options] - A set of options for the event.
     * @param {name} [options.name] - The name of the event.
     * @param {addListenerCallback} [options.addListenerCallback] - A function that is
     * called when a listener is added.
     * @param {removeListenerCallback} [options.removeListenerCallback] - A function
     * that is called when a listener is removed.
     * @param {notifyListenersCallback} [options.notifyListenersCallback] - A function
     * that is called before a listener is notified and can filter the notification.
     */
    constructor({
        name = null,
        addListenerCallback = null,
        removeListenerCallback = null,
        notifyListenersCallback = null
    } = {
        name: null,
        addListenerCallback: null,
        removeListenerCallback: null,
        notifyListenersCallback: null
    }) {
        this.name = name;
        this.addListenerCallback = addListenerCallback;
        this.removeListenerCallback = removeListenerCallback;
        this.notifyListenersCallback = notifyListenersCallback;
        this.listeners = new Map();
    }

    /**
     * Add an event listener with the specified options. If the listener has
     * previously been added for the event, the listener's options will be
     * updated.
     * @param {Function} listener - The listener to call when the event fires.
     * @param {Object} options - Options for when the listener should be called.
     */
    addListener(listener, options) {
        if(this.addListenerCallback !== null) {
            this.addListenerCallback(listener, options);
        }
        this.listeners.set(listener, options);
        // If the event has a name, annotate the listener with the name
        if(typeof this.name === "string") {
            listener.webScienceEventName = this.name;
        }
    }

    /**
     * Remove an event listener.
     * @param {Function} listener - The listener to remove.
     */
    removeListener(listener) {
        if(this.removeListenerCallback !== null) {
            this.removeListenerCallback(listener, this.listeners.get(listener));
        }
        this.listeners.delete(listener);
    }

    /**
     * Check whether a particular event listener has been added.
     * @param {EventCallbackFunction} listener - The listener to check.
     * @returns {boolean} Whether the listener has been added.
     */
    hasListener(listener) {
        return this.listeners.has(listener);
    }

    /**
     * Check whether there are any listeners for the event.
     * @returns {boolean} Whether there are any listeners for the event.
     */
    hasAnyListeners() {
        return this.listeners.size > 0;
    }

    /**
     * Notify the listeners for the event.
     * @param {Array} [listenerArguments=[]] - The arguments that will be passed to the
     * listeners.
     */
    notifyListeners(listenerArguments = []) {
        this.listeners.forEach((options, listener) => {
            try {
                if((this.notifyListenersCallback === null) || this.notifyListenersCallback(listener, listenerArguments, options)) {
                    listener.apply(null, listenerArguments);
                }
            }
            catch(error) {
                debugLog(`Error in listener notification: ${error}`);
            }
        });
    }
}

/**
 * An extension of the Event class that permits only one listener at a time.
 * @template EventCallbackFunction
 * @template EventOptions
 * @extends {Event<EventCallbackFunction, EventOptions>}
 * @private
 */
class EventSingleton extends Event {
    /**
     * A function that adds an event listener, with optional parameters. If the
     * listener has previously been added for the event, the listener's options
     * (if any) will be updated.
     * @param {EventCallbackFunction} listener - The function to call when the event fires.
     * @param {EventOptions} options - Options for when the listener should be called.
     * The supported option(s) depend on the event type.
     * @throws {Error} This function throws an Error if there is already a listener for
     * the event.
     */
    addListener(listener, options) {
        if(this.listeners.size > 0)
            throw new Error("Error: cannot add more than one listener to EventSingleton event.");
        super.addListener(listener, options);
    }
}

/**
 * Create a new Event object that implements WebExtensions event syntax, with the
 * provided options.
 * @param {Object} [options] - The options for the event.
 * @param {string} options.name - The name of the event.
 * @param {addListenerCallback} [options.addListenerCallback] - A function that is
 * called when a listener is added.
 * @param {removeListenerCallback} [options.removeListenerCallback] - A function
 * that is called when a listener is removed.
 * @param {notifyListenersCallback} [options.notifyListenersCallback] - A function
 * that is called before a listener is notified and can filter the notification.
 * @param {boolean} [options.singleton = false] - Whether to allow only one listener
 * for the event.
 * @returns {Event} - The created `Event` object.
 */
 export function createEvent({
    name = null,
    addListenerCallback = null,
    removeListenerCallback = null,
    notifyListenersCallback = null,
    singleton = false
} = {
    name: null,
    addListenerCallback: null,
    removeListenerCallback: null,
    notifyListenersCallback: null,
    singleton: false
}) {
    if(singleton) {
        return new EventSingleton({
            name,
            addListenerCallback,
            removeListenerCallback,
            notifyListenersCallback
        });
    }
    return new Event({
        name,
        addListenerCallback,
        removeListenerCallback,
        notifyListenersCallback
    });
}
