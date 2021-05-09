/**
 * This module enables machine learning classification of DOM elements using
 * Mozilla Fathom.
 *
 * A client will call addListener on the webScience.fathom.onFathomData event,
 * specifiying their callback and matchPatterns (specifying which URLs to run
 * fathom on).  This background script then stores this information in a Map,
 * with the key being the client's callback, and the value being the client's
 * preferences.
 *
 * When a page is opened, this background script will send an isClassifiable
 * message to the page's content script, only if the page url matches any
 * listener matchPattern. The client content script will call
 * window.webScience.fathom.addTrainees to add their rulesets. When the fathom
 * content script receives an isClassifiable message, it will pull these
 * rulesets from the global window to run Fathom on the page.
 *
 * Once the content script is done with classification, a fathomData message
 * containing the results is sent to the background script, which contains the
 * results. These messages are then processed using the client's callbacks.
 *
 * @module webScience.fathom
 */

import {ruleset, rule, dom, type, score, out, utils} from 'fathom-web';
const {isVisible, linearScale} = utils;

import * as pageManager from "./pageManager.js";
import * as messaging from "./messaging.js";
import * as events from "./events.js";
import * as matching from "./matching.js";
import * as inline from "./inline.js";
import fathomContentScript from "./content-scripts/fathom.content.js";

/**
 * Fathom classification results sent by the content script.
 * @typedef {Object} FathomDataObject
 *
 * TODO: Finalize data schema
 * Likely would involve the URL, pageID, and the fathom classification results.
 * Currently, just sends an object containing every element with greater than
 * 0.5 confidence score (key), along with their feature vector and actual score (value).
 */

/**
 * The listener specified by the client.
 * @callback fathomDataListener
 * @param {FathomDataObject} Results of the Fathom classification on a page.
 */

/**
 * @typedef {Object} FathomDataListenerRecord
 * @property {matching.MatchPatternSet} matchPatternSet - The match patterns for the listener.
 * @property {browser.contentScripts.RegisteredContentScript} contentScript - The content
 * script associated with the listener.
 */

/**
 * A map where the key is a listener function and each value is a record for that listener function.
 * @constant {Map<fathomDataListener, FathomDataListenerRecord>}
 * @private
 */
const fathomDataListeners = new Map();

/**
 * An event that fires when a page's contents has been successfully classified
 * through a Fathom content script. 
 *
 * @constant onFathomData
 */
export const onFathomData = events.createEvent({
    name: "webScience.fathom.onFathomData",
    addListenerCallback: addListener,
    removeListenerCallback: removeListener,
    notifyListenersCallback: () => { return false; }
});

/**
 * Whether the module has completed initialization.
 * @type{boolean}
 * @private
 */
let initialized = false;


/**
 * A callback function to add a fathomDataListener.
 * @param {fathomDataCallback} listener - The listener that is being removed.
 * @param {Object} options - Options for the listener.
 * @param {string[] options.matchPatterns} matchPatterns - The match patterns 
 * for pages where the listener should be notified.
 * @private
 */
async function addListener(listener, {matchPatterns}) {
    // Initialize the listener
    if (!initialized) {
        initialized = true;

        // Initialize pageManager
        await pageManager.initialize();
        
        // Listen for Fathom classification results, sent by content script
        // This messageListener receives a fathomDataObject from a content script.
        messaging.onMessage.addListener(messageListener,
            {
                type: "webScience.fathom.fathomData",
                schema: {
                    results: "object"
                }
            }
        );
        
        // Message to send to content script if this page should be classified
        messaging.registerSchema("webScience.fathom.isClassifiable", {
            isClassifiable: "boolean",
        })

        // When a tab is updated, send it a message if the page should be 
        // classified with Fathom
        // TODO: onUpdated may not be the right event
        browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if ("url" in tab) {
                // Iterate over listenerRecords, check if this url matches any
                classifiable = false;
                for (const listenerRecord of fathomDataListeners.values()) {
                    if (listenerRecord.matchPatternSet.matches(tab.url)) {
                        classifiable = true;
                        break;
                    }
                }
                // Send the message to content script
                messaging.sendMessageToTab(tabId, {
                    type: "webScience.fathom.isClassifiable",
                    isClassifiable: classifiable,
                });
            }
        });
    }

    // Register content script for the listener
    const contentScript = await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            code: inline.dataUrlToString(fathomContentScript)
        }],
        runAt: "document_idle"
    })

    // Compile the match patterns for the listener
    const matchPatternSet = matching.createMatchPatternSet(matchPatterns);

    // Add listener to fathomDataListeners map
    fathomDataListeners.set(listener, {
        matchPatternSet,
        contentScript
    });
}


/**
 * A callback function to remove a fathomDataListener.
 * @param {fathomDataCallback} listener - The listener that is being removed.
 * @private
 */
function removeListener(listener) {
    const listenerRecord = fathomDataListeners.get(listener);
    if (listenerRecord === undefined) {
        return;
    }
    listenerRecord.contentScript.unregister();
    fathomDataListeners.delete(listener);
}

/**
 * A callback function to handle messages from the content script.
 * @param {FathomDataObject} fathomDataObject - Fathom classification results.
 * @private
 */
function messageListener(fathomDataObject) {
    console.log("messageListener called");
    for (const [listener, listenerRecord] of fathomDataListeners) {
        listener(fathomDataObject);

        // Notify listener if the url matches the listener's matchPatterns
        if (listenerRecord.matchPatternSet.matches(fathomDataObject.url)) {
            listener(fathomDataObject);
        }
    }
}
