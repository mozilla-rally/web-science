/**
 * This module provides functionality for constructing events similar to
 * WebExtensions `events.Event` objects.
 *
 * @module webScience.events
 */

import * as debugging from "./debugging.js";

/**
 * @constant {debugging.debuggingLogger}
 * @private
 */
const debugLog = debugging.getDebuggingLog("events");

/**
 * A callback function with no parameters.
 * @callback callbackWithoutParameters
 */

/**
 * A class that provides an event API similar to WebExtensions `events.Event` objects.
 * Use the `createEvent` function to create an Event object.
 * @template EventCallbackFunction
 * @template EventOptions
 */
class Event {
    /**
     * Creates an event instance similar to WebExtensions `events.Event` objects.
     * @param {Object} [options] - A set of options for the event.
     * @param {name} [options.name] - The name of the event.
     * @param {addListenerCallback} [options.addListenerCallback] - A function that is
     * called when a listener function is added.
     * @param {removeListenerCallback} [options.removeListenerCallback] - A function
     * that is called when a listener function is removed.
     * @param {notifyListenersCallback} [options.notifyListenersCallback] - A function
     * that is called before a listener is notified and can filter the notification.
     * @private
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
     * A callback function that is called immediately before a new listener function is added.
     * @callback addListenerCallback
     * @param {EventCallbackFunction} listener - The new listener function.
     * @param {EventOptions} options - The options for the new listener function.
     */

    /**
     * A function that adds an event listener, with optional parameters. If the
     * listener has previously been added for the event, the listener's options
     * (if any) will be updated.
     * @param {EventCallbackFunction} listener - The function to call when the event fires.
     * @param {EventOptions} options - Options for when the listener should be called.
     * The supported option(s) depend on the event type.
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
     * A callback function that is called immediately after a listener function is removed.
     * @callback removeListenerCallback
     * @param {EventCallbackFunction} listener - The listener function to remove.
     * @param {EventOptions} options - The options that the listener was added with.
     */

    /**
     * A function that removes an event listener.
     * @param {EventCallbackFunction} listener - The listener function to remove.
     */
    removeListener(listener) {
        if(this.removeListenerCallback !== null) {
            this.removeListenerCallback(listener, this.listeners.get(listener));
        }
        this.listeners.delete(listener);
    }

    /**
     * A function that checks whether a particular event listener has been added.
     * @param {EventCallbackFunction} listener - The listener function to check.
     * @returns {boolean} Whether the listener function has been added.
     */
    hasListener(listener) {
        return this.listeners.has(listener);
    }

    /**
     * Checks whether there are any listeners registered.
     * @returns {boolean} Whether there are any listeners
     */
    hasAnyListeners() {
        return this.listeners.size > 0;
    }

    /**
     * A callback function that is called when a listener function may be notified.
     * @callback notifyListenersCallback
     * @param {EventCallbackFunction} listener - The listener function that may be called.
     * @param {Array} listenerArguments - The arguments that would be passed to the listener
     * function.
     * @param {EventOptions} options - The options that the listener was added with.
     * @returns {boolean} Whether to call the listener function.
     */

    /**
     * Notify the listener functions for the event.
     * @param {Array} [listenerArguments=[]] - The arguments that will be passed to listener
     * functions.
     */
    notifyListeners(listenerArguments = []) {
        this.listeners.forEach((options, listener) => {
            try {
                if((this.notifyListenersCallback === null) || this.notifyListenersCallback(listener, listenerArguments, options))
                    listener.apply(null, listenerArguments);
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
 * @param {string} name - The name of the event.
 * @param {addListenerCallback} [options.addListenerCallback] - A function that is
 * called when a listener function is added.
 * @param {removeListenerCallback} [options.removeListenerCallback] - A function
 * that is called when a listener function is removed.
 * @param {notifyListenersCallback} [options.notifyListenersCallback] - A function
 * that is called before a listener is notified and can filter the notification.
 * @param {boolean} [options.singleton = false] - Whether to allow only one listener
 * for the event.
 * @returns {Event} - The created Event object.
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