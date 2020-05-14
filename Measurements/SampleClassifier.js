/**
 * @file Script for computing aggregate statistics
 * @module WebScience.Measurements.Classifier
 */

 let param = 7;
 let name = "";
/**
 * Event handler for messages from the main thread
 * On receiving data, the function computes aggregate statistics and 
 * sends a message back to the caller with the result object.
 * 
 * @param {MessageEvent} event - message object
 * @listens MessageEvent
 */
onmessage = event => {
    let data = event.data;
    if (data.type === "init") {
        // set param to the number of properties in the json object
        param = Object.keys(data.args).length;
        name = data.name;
    } else if (data.type === "classify") {
        sendMessageToCaller("classifier ", classifyUsingMetadata(data.payload));
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
function sendMessageToCaller(messageType, data) {
    postMessage({
        type: messageType,
        data: data,
        param: param,
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
