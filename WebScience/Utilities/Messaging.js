/** 
 * This module provides a convenience wrapper around browser.runtime.onMessage,
 * routing messages to the right listener(s) based on the message type.
 * Message types are defined as strings, and a message must be an object with a
 * type field to be handled correctly.
 * @module WebScience.Utilities.Messaging
 */

import * as WebScience from "/WebScience/WebScience.js"
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("Utilities.Messaging");

// Message listeners are stored in a Map where the key is the message type and
// the value is a Set of listeners.
const messageRouter = new Map();

// Message schemas are stored in a Map where the key is the message type and
// the value is the schema.
const messageSchemas = new Map();

var initialized = false;

// A listener for browser.runtime.onMessage that routes messages to the right
// listener(s) based on message type.
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
 * parameters as if it had been called by browser.runtime.onMessage, and that can
 * return the same values as a listener to browser.runtime.onMessage.
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
 * @param {object} messageSchema - An object where each field has a value that is
 * a type string.
 */
export function registerSchema(messageType, messageSchema) {
    if(messageSchemas.has(messageType))
        debugLog("Multiple schemas for message type " + messageType);
    messageSchemas.set(messageType, messageSchema);
}