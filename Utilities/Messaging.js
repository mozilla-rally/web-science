/**
 * This module provides functionality for passing messages between the
 * background page and content script environments. Messages between the
 * environments are easily malformed, and minor errors in message handlers
 * can have cascading effects. These problems can be quite difficult to debug.
 * This module addresses these issue by providing a simple message type and
 * type checking system on top of `browser.runtime.onMessage` and
 * `browser.tabs.sendMessage`.
 * 
 * # Messages
 * A message, for purposes of this module, must be an object and must have a
 * type property with a string value.
 * 
 * # Schemas
 * A schema, for purposes of this module, must be an object. Each property in
 * the schema object is a property that is required in a corresponding message
 * object. Each value in the schema object is a string that must match the
 * `typeof` value for that property in a corresponding message.
 * 
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
 * Validates that a message is an object with a type string.
 * @param {*} message - The message.
 * @returns {boolean} Whether the message is an object with a type string.
 */
export function validateMessageObject(message) {
    // If the message does not have the right type, fail validation.
    if ((typeof message !== "object") || (message === null)) {
        debugLog(`Unable to validate message with type: ${typeof message}`);
        return false;
    }

    // If there is no type string, fail validation.
    if(!("type" in message) || (typeof message.type !== "string")) {
        debugLog(`Unable to validate message object with missing type string: ${JSON.stringify(message)}`);
        return false;
    }

    return true;
}

/**
 * Validates a message against a registered schema. Assumes that the message is an object
 * with a type string. If you cannot guarantee that, call `validateMessageObject` first.
 * @param {*} message - The message, which must be an object that matches the properties
 * and types specified in the schema.
 * @param {object} [messageSchema] - The schema to use for validation. If no schema is
 * specified, this function attempts to retrieve the registered schema for the message type.
 * @returns {boolean} Whether the message successfully validated against the schema. Returns
 * `false` if there is a schema mismatch or if there is no schema registered for the message
 * type.
 */
export function validateMessageAgainstSchema(message, messageSchema)
{
    // If the caller doesn't specify a message schema, attempt to retrieve the registered schema.
    if(messageSchema === undefined) {
        messageSchema = messageSchemas.get(message.type);
        if(messageSchema === undefined) {
            debugLog(`No schema for message with type: ${message.type}`);
            return false;
        }
    }

    // Check the message against the schema.
    for(let field in messageSchema) {
        if (!(field in message) || (typeof message[field] !== messageSchema[field])) {
            debugLog(`Mismatch between message and schema: ${JSON.stringify(message)}`);
            return false;
        }
    }
    return true;
}

/**
 * A listener for `browser.runtime.onMessage` that routes messages to the right
 * listener(s) based on message type. See the documentation for `browser.runtime.onMessage`
 * for detail on the parameters.
 * @returns {Promise} - An optional response to the message.
 * @private
 */
function browserRuntimeListener(message, sender, sendResponse) {
    let messageListeners, messageSchema, browserRuntimeReturnValue;

    // If the message is not in an expected format, ignore it.
    if(!validateMessageObject(message)) {
        debugLog(`browser.runtime message with unexpected format: ${JSON.stringify(message)}`);
        return;
    }

    // If the message does not have at least one registered listener, ignore it.
    if ((messageListeners = messageRouter.get(message.type)) === undefined) {
        debugLog(`browser.runtime message with no listener for message type: ${JSON.stringify(message)}`);
        return;
    }

    // If there is a schema registered for this message type, check the message against the schema.
    if(((messageSchema = messageSchemas.get(message.type)) !== undefined)
         && !validateMessageAgainstSchema(message, messageSchema)) {
             debugLog(`browser.runtime message failed schema validation: ${JSON.stringify(message)}`);
        return;
    }

    for (const messageListener of messageListeners) {
        var messageListenerReturnValue = messageListener(message, sender, sendResponse);
        if ((messageListenerReturnValue !== undefined) && (browserRuntimeReturnValue !== undefined))
            debugLog(`Multiple listener return values for message type: ${message.type}`);
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
 * Unregisters a message listener.
 * @param {string} messageType - The type of message that triggers the listener function.
 * @param {function} messageListener - The listener function.
 * @param {boolean} [unregisterSchema=true] - Whether to unregister the schema for the message type, if there is one.
 */
export function unregisterListener(messageType, messageListener, unregisterSchema) {
    var messageListeners = messageRouter.get(messageType);
    if(messageListeners !== undefined) {
        messageListeners.delete(messageListener);
        if(messageListeners.size === 0)
            messageRouter.delete(messageType);
    }
    if(unregisterSchema)
        messageSchemas.delete(messageType);
}

/**
 * Registers a message schema.
 * @param {string} messageType - The type of message that must follow the schema.
 * @param {Object} messageSchema - An object where each field has a value that is
 * a built-in type string.
 */
export function registerSchema(messageType, messageSchema) {
    // Check whether the schema has already been registered
    if(messageSchemas.has(messageType)) {
        debugLog(`Multiple schemas for message type: ${messageType}`);
        return;
    }
    messageSchemas.set(messageType, messageSchema);
}

/**
 * Sends a message to a tab after checking the message against the registered
 * schema for the message type. Equivalent to calling `browser.tabs.sendMessage`
 * with a `catch` handler after validating the message against the schema.
 * @param {number} tabId - The ID of the tab that should receive the message.
 * @param {Object} message - The contents of the message.
 * @returns {Promise} - The same return value as `browser.tabs.sendMessage`,
 * or a Promise that resolves to false if there was an errror sending the message.
 */
export function sendMessageToTab(tabId, message) {
    // Validate the outbound message against the schema
    if(!validateMessageObject(message) || !validateMessageAgainstSchema(message)) {
        debugLog(`Attempted to send message that fails validation: ${JSON.stringify(message)}`);
        return new Promise((resolve) => { resolve(false); });
    }
    return browser.tabs.sendMessage(tabId, message).catch((reason) => {
        debugLog(`Unable to send message to tab: ${JSON.stringify(message)}`);
        return false;
    });
}