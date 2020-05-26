/**
 * This module periodically runs analysis scripts (in a separate thread) and
 * reports the results.
 * @module WebScience.Measurements.PageClassification
 */
import * as Messaging from "../Utilities/Messaging.js";
import * as Debugging from "../Utilities/Debugging.js";
import * as Storage from "../Utilities/Storage.js";

const debugLog = Debugging.getDebuggingLog("Measurements.PageClassification");

var initialized = false;
var nextPageClassificationIdCounter = false;
/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;
/**
 * A Map that stores worker objects. The keys are message types (used when
 * registering classifiers) and the values
 * are worker objects that has functions such as postMessage
 * @private
 * @const {Map<string,Worker>}
 */
const workers = new Map();

async function initialize() {
    if(initialized) return;
    storage = await (new Storage.KeyValueStorage("WebScience.Measurements.PageClassification")).initialize();
    nextPageClassificationIdCounter = await (new Storage.Counter("WebScience.Measurements.PageClassification.nextPageId")).initialize();
    initialized = true;
}
/**
 * Registers readability script for pages that belong to a set of patterns.
 * 
 * Injects readability content scripts that match given patterns. The content
 * script extracts page metadata and sends it back.
 * @param {Array.string} matchPatterns - Match patterns of the form scheme://<host><path>
 * @param {string} messageType - an identifier for the background script and content
 * script to communicate
 */
async function registerContentScript(matchPatterns, messageType) {
    // setup content script injection
    var injectClassifierName = ['/* Inject classifier name: */ let name =  "' + messageType + '";',
    '// code ----->'].join('\n');

    debugLog(injectClassifierName);
    await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            code: injectClassifierName
        },
        {
            file: "/WebScience/Measurements/content-scripts/Readability.js"
        },
        {
            file: "/WebScience/Measurements/content-scripts/metadata.js"
        }
        ],
        runAt: "document_idle"
    });
}

/**
 * Listen for messages from content script, pass them to classifier, listens for
 * classification results and sends back results to the registered result
 * listener function
 * 
 * @param {string} messageType listen for messages of this type from content script
 * @param {function} resultListener result listener function
 */
function listenForContentScriptMessages(messageType, resultListener) {
    Messaging.registerListener(messageType, (metadata, sender) => {
        if (!("tab" in sender)) {
            debugLog("Warning: unexpected metadata message");
            return;
        }
        // add tab id to metadata
        metadata.context["tabID"] = sender.tab.id;
        /**
         * Handler for errors from worker threads
         * @param {Event} err - error 
         */
        function workerError(err) {
            debugLog("error :" + err);
        }
        async function resultReceiver(result) {
            let data = result.data;
            let classificationStorageObj = {...data, ...metadata.context};
            debugLog("storing " + JSON.stringify(classificationStorageObj));
            storage.set("" + nextPageClassificationIdCounter.get(), classificationStorageObj);
            await nextPageClassificationIdCounter.increment();
            resultListener({...data, ...metadata.context});
        }
        // fetch worker associated with this 
        let worker = workers.get(messageType);
        // send metadata as a message to the classifier script
        worker.postMessage({
            type: "classify",
            payload: metadata
        });
        // receive the result classification result.
        worker.addEventListener('message', async (result) => { await resultReceiver(result)});
        worker.addEventListener('error', workerError);
    }, {
        type: "string",
        url: "string",
        title: "string"
    });
}

/**
 * Register classifiers with a set of match patterns. Init args are sent via a
 * special message to the worker to initialize the classifier. Any pages that
 * matches given patterns are classified using the provided classifier and the
 * results sent back to the callback function. The function also injects
 * readability script into pages to fetch the page metadata before sending it to
 * the classifier script.
 * 
 * @param {Array.string} matchPatterns Array of match patterns
 * @param {string} classifierFilePath Location of the classifier worker script
 * @param {Object} initArgs Data for initializing classifier (viz feature
 * weights). JSON object can be imported via .js file with export.
 * @param {string} messageType Name for identifying this classifier
 * @param {function} listener Callback for classification result
 */
export async function registerPageClassifier(matchPatterns, classifierFilePath, initArgs, messageType, listener) {
    // initialize module
    await initialize();
    // TODO : check that name is not in use
    if(messageType in workers) {
        debugLog("classifier exists with same name");
        return;
    }
    workers.set(messageType, setupClassifier(messageType, classifierFilePath, initArgs));
    // setup content scripts for extracting metadata from matched pages
    await registerContentScript(matchPatterns, messageType);
    // setup comunication with worker via message passing
    listenForContentScriptMessages(messageType, listener);

}

/**
 * A helper function for initializing classifier 
 * @param {string} classifierName Classifier name
 * @param {string} classifierFilePath Location of classifier script
 * @param {Object} initArgs Data for initializing classifier
 */
function setupClassifier(classifierName, classifierFilePath, initArgs) {
    let worker = new Worker(classifierFilePath);
    worker.postMessage({
        type: "init",
        name: classifierName,
        args : initArgs
    });
    return worker;
}