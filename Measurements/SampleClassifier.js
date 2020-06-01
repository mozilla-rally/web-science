/**
 * @file Script for computing aggregate statistics
 * @module WebScience.Measurements.Classifier
 */

 let param = 7;
 let name = "";
/**
 * Event handler for messages from the main thread. It handles two types of
 * messages. "init" messages are for initializing classifier defined in this file.
 * "classify" messages are requests for classifying new data.
 * 
 * @param {MessageEvent} event - message object
 * @param {MessageEvent.data} event.data - data object
 * @listens MessageEvent
 */
onmessage = event => {
    let data = event.data;
    if (data.type === "init") {
        // set param to the number of properties in the json object
        param = Object.keys(data.args).length;
        name = data.name;
    } else if (data.type === "classify") {
        sendMessageToCaller("classifier ", classifyUsingMetadata(data.payload), data.payload.url);
    }
}

/**
 * Error handler
 * @param {ErrorEvent} event - error object
 * @listens ErrorEvent
 */
onerror = event => {
    console.error(event.message);
}

/**
 * Sends messages to the main thread that spawned this worker thread.
 * Each message has a type property for the main thread to handle messages.
 * The data property in the message contains the data object that the worker
 * thread intends to send to the main thread. 
 * 
 * @param {string} messageType message type
 * @param {Object} data data to be sent
 */
function sendMessageToCaller(messageType, data, url) {
    postMessage({
        type: messageType,
        predicted_class: data,
        url: url,
        name: name
    });
}

/**
 *  Function that classifies page based on title, url and content
 * @param {Object} metadata - object containing metadata
 * @param {string} metadata.url - page url
 * @param {string} metadata.title - page title
 * @param {string} metadata.content - page content as parsed by the readbility script
 * @returns {number} class number
 */
function classifyUsingMetadata(metadata) {
    // TODO : Replace with actual classifier
    // ************ Implement the actual classifier here ****** 
    // The following is a dummy classifier that maps page to [0, 10) based on
    // content length
    return metadata.content.length % param;
}
