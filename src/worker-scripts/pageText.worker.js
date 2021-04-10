/**
 * Web Worker script for the pageText module. Provides a self.webScience.pageText.onTextParsed
 * event for an imported worker script.
 * @module webScience.pageText.content
 */

import { createEvent } from "../events.js";

// Create the webScience.pageText.onTextParsed event
if(!("webScience" in self)) {
    self.webScience = { };
}
self.webScience.pageText = {
    onTextParsed: createEvent()
};

// Handle messages from the background script
self.addEventListener("message", message => {
    if(typeof message.data === "object") {
        if(message.data.type === "webScience.pageText.registerWorker") {
            self.importScripts(message.data.url);
        }
        else if(message.data.type === "webScience.pageText.onTextParsed") {
            self.webScience.pageText.onTextParsed.notifyListeners([ message.data.textParsedDetails ]);
        }
    }
});
