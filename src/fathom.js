/**
 * This module enables machine learning classification of DOM elements using
 * Mozilla Fathom.
 *
 * A client will call addListener on the webScience.fathom.onFathomData event, specifiying
 * their callback, trainees, and matchPatterns (specifying which URLs to run fathom on).
 * This background script then stores this information in a Map, with the key being the client's
 * callback, and the value being the client's preferences.
 *
 * When a page is opened, the background script will determine which trainees to use
 * and if the page matches the matchPattern. A message will then be
 * sent to the content script containing the relevant trainees. The content script will
 * then run Fathom to classify elements in the page.
 *
 * Once the content script is done with classification, it will send a message
 * to the background script, which contains the results. These messages are
 * then processed using the client's callbacks.
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
import addTrainees from "./content-scripts/fathom.content.js";
import fathomContentScript from "./content-scripts/fathom.content.js";

export function test() {
    const rules = ruleset([
		// Look at all divs
		rule(dom('div'), type('test')),
        // Score based on visibility
		rule(type('test'), score(isVisible), {name: 'visible'}),
        // Output max score
		rule(type('test').max(), out('test'))
    ])

    console.log("Fathom module test message.");
}

/**
 * @typedef {Object} Trainees
 * https://mozilla.github.io/fathom/example.html?highlight=trainees
 * 
 * The Trainees object is a set of rules for the Fathom trainer. This object
 * contains coefficients, bias, viewportSize, and the set of rules (which
 * specifies which DOM elements to process, and how to calculate scores) that
 * will be applied to the page. 
 */

/**
 * Fathom classification results sent by the content script.
 * @typedef {Object} FathomDataObject
 * @property {number} pageId - The ID for the page, unique across browsing sessions.
 * @property {string} url - The URL of the page, without any hash.
 */

/**
 * The listener specified by the client.
 * @callback fathomDataListener
 * @param {FathomDataObject} Results of the Fathom classification on a page.
 */

/**
 * @typedef {Object} FathomDataListenerRecord
 * @property {matching.MatchPatternSet} matchPatternSet - The match patterns for the listener.
 * @property {Trainees} trainees - The trainees (rulesets) for this listener
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
 * @param {fathom.Trainees} trainees - The trainees for this listener, a Map.
 * @private
 */
async function addListener(listener, {matchPatterns, trainees}) {
    // Initialize the listener
    if (!initialized) {
        initialized = true;

        // Initialize pageManager
        await pageManager.initialize();
        
        // Listen for Fathom classification messages
        // This messageListener receives a fathomDataObject from a content script.
        messaging.onMessage.addListener(messageListener,
            {
                type: "webScience.fathom.fathomData",
                schema: {
                    test: "string",
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
        browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if ("url" in tab) {
                classifiable = false;
                traineesSet = {}
                for (const listenerRecord of fathomDataListeners.values()) {
                    if (listenerRecord.matchPatternSet.matches(tab.url)) {
                        // Get all the relevant trainees, merge to traineesSet
                        for (const trainee of listenerRecord.trainees.keys()) {
                            if (trainee in traineesSet) {
                                console.warn("Duplicate trainees found: " + trainee);
                            }
                            traineesSet[trainee] = listenerRecord.trainees.get(trainee);
                            // traineesSet[trainee].rulesetMaker = traineesSet[trainee].rulesetMaker.toString();
                            classifiable = true;
                        }
                    }
                }
                function sendIsClassifiable() {
                    messaging.sendMessageToTab(tabId, {
                        type: "webScience.fathom.isClassifiable",
                        isClassifiable: classifiable,
                    });
                }
                setTimeout(sendIsClassifiable, 3000); //TODO: remove
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
        trainees,
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
