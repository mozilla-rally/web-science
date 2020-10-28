/**
 * This module provides a convenience wrapper around `browser.runtime.onMessage`,
 * routing messages to the right listener(s) based on the message type.
 * Message types are defined as strings, and a message must be an object with a
 * type property to be handled correctly.
 * @module WebScience.Utilities.Messaging
 */

import * as Debugging from "./Debugging.js"

const debugLog = Debugging.getDebuggingLog("Utilities.Messaging");

/**
 * A Map that stores message listeners. The keys are message types and the values
 * are Sets of message listeners.
 * @private
 * @const {Map<string,Set<function>>}
 */
const messageRouter = new Map();

/**
 * A Map that stores message schemas. The keys are message types and the values
 * are schemas.
 * @private
 * @const {Map<string,Object>}
 */
const messageSchemas = new Map();

/**
 * Whether the module's `browser.runtime.onMessage` listener has been registered.
 * @private
 * @type {boolean}
 * @default
 */
var initialized = false;

/**
 * A listener for `browser.runtime.onMessage` that routes messages to the right
 * listener(s) based on message type. See the documentation for `browser.runtime.onMessage`
 * for detail on the parameters.
 * @returns {Promise} - An optional response to the message.
 * @private
 */
function browserRuntimeListener(message, sender, sendResponse) {
    var messageListeners;
    var messageSchema;
    var browserRuntimeReturnValue;
    // If the message is not in an expected format or does not have at least
    // one registered listener, ignore it.
    if ((message == null) ||
        (typeof message !== "object") ||
        !("type" in message) ||
        (typeof message.type !== "string") ||
        ((messageListeners = messageRouter.get(message.type)) === undefined)) {
        debugLog("Unexpected browser.runtime message: " + JSON.stringify(message));
        return;
    }
    // If there is a schema registered for this message type, check the message against the schema
    if((messageSchema = messageSchemas.get(message.type)) !== undefined) {
        for(var field in messageSchema) {
            if (!(field in message) || (typeof message[field] != messageSchema[field])) {
                debugLog("Mismatch between message and schema: " + JSON.stringify(message));
                return;
            }
        }
    }
    for (const messageListener of messageListeners) {
        var messageListenerReturnValue = messageListener(message, sender, sendResponse);
        if ((messageListenerReturnValue !== undefined) && (browserRuntimeReturnValue !== undefined))
            debugLog("Multiple listener return values for message type " + message.type);
        browserRuntimeReturnValue = messageListenerReturnValue;
    }
    return browserRuntimeReturnValue;
}

/**
 * Registers a message listener.
 * @param {string} messageType - The type of message that triggers the listener function.
 * @param {function} messageListener - The listener function, which receives the same
 * parameters as if it had been called by `browser.runtime.onMessage`, and that can
 * return the same values as a listener to `browser.runtime.onMessage`.
 * @param {object} [messageSchema] - An optional schema to register for the message type.
 */
export function registerListener(messageType, messageListener, messageSchema) {
    if (!initialized) {
        initialized = true;
        browser.runtime.onMessage.addListener(browserRuntimeListener);
    }

    var messageListeners = messageRouter.get(messageType);
    if (messageListeners === undefined) {
        messageListeners = new Set();
        messageRouter.set(messageType, messageListeners);
    }
    messageListeners.add(messageListener);

    if(messageSchema !== undefined)
        registerSchema(messageType, messageSchema);
}

/**
 * Registers a message schema.
 * @param {string} messageType - The type of message that must follow the schema.
 * @param {Object} messageSchema - An object where each field has a value that is
 * a built-in type string.
 */
export function registerSchema(messageType, messageSchema) {
    if(messageSchemas.has(messageType))
        debugLog("Multiple schemas for message type " + messageType);
    messageSchemas.set(messageType, messageSchema);
}
