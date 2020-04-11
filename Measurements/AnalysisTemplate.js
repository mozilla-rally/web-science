/**
 * @file Sample analysis script
 * @module WebScience.Measurements.AnalysisTemplate
 */

/**
 * instance of indexedDB database
 * @type {IDBDatabase} 
 * @private
 */
let db;

/**
 * Event handler for messages from the main thread
 * On receiving "run" trigger, it waits for 5 seconds and tries to open an
 * indexed database. The wait is used to simulate intense computation. It shows
 * that the main thread is not blocked. At the end of timeout, a result object
 * is created and communicated back to the main thread.
 * 
 * @param {MessageEvent} event - message object
 * @listens MessageEvent
 */
onmessage = event => {
    let data = event.data;
    switch (data) {
        case "run":
            sendMessageToCaller("status", "started");
            setTimeout(function () {
                let req = indexedDB.open("analytics", 1);
                req.onsuccess = function (event) {
                    db = event.target.result;
                    sendMessageToCaller("result", {
                        status: "ok",
                        message: "measurements database opened",
                        time: 5000
                    });
                };
            }, 5000)
            break;
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
          data: data
      });
  }