/**
 * Classify web pages based on their content, title, and URL
 * Inject content scripts to  scripts   using an arbitrary classifier in reponse to messages from content scripts
 * @module WebScience.Measurements.PageClassification
 */
import * as Messaging from "../Utilities/Messaging.js";
import * as Debugging from "../Utilities/Debugging.js";
import * as Storage from "../Utilities/Storage.js";

const debugLog = Debugging.getDebuggingLog("Measurements.PageClassification");

/**
 * Whether the classification module is initialized (at least one registration)
 * @private
 * @type {boolean}
 * @default
 */
var initialized = false;
/**
 * Counter for storing classification results
 * @type {Storage.Counter}
 * @private
 */
var nextPageClassificationIdCounter = null;
/**
 * A KeyValueStorage object for data associated with the study.
 * @type {Object}
 * @private
 */
var storage = null;
/**
 * Store worker objects keyed by classifier id
 * 
 * @private
 * @const {Map<string,Worker>}
 */
const workers = new Map();

/**
 * Setup storage and counter objects.
 * 
 */
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
 * @param {string} workerId - an identifier for the background script and content
 * script to communicate
 */
async function registerContentScript(matchPatterns, workerId) {
    // setup content script injection
    var injectWorkerId = ['/* Inject worker id: */ let workerId =  "' + workerId + '";',
    '// code ----->'].join('\n');

    await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            code: injectWorkerId
        },
        {
            file: "/WebScience/Measurements/content-scripts/Readability.js"
        },
        {
            file: "/WebScience/Measurements/content-scripts/page-content.js"
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
 * @param {string} workerId the id of the worker associated with the content script
 * @param {function} resultListener result listener function
 */
function listenForContentScriptMessages(workerId, resultListener) {
    Messaging.registerListener(workerId, (pageContent, sender) => {
        if (!("tab" in sender)) {
            debugLog("Warning: unexpected message");
            return;
        }
        // add tab id to metadata
        pageContent.context["tabID"] = sender.tab.id;
        /**
         * Handler for errors from worker threads
         * @param {Event} err - error 
         */
        function workerError(err) {
            debugLog(err.message + err.filename + err.lineno);
        }
        async function resultReceiver(result) {
            let data = result.data;
            data.url = Storage.normalizeUrl(data.url);
            let classificationStorageObj = {...data, ...pageContent.context};
            //storage.set("" + nextPageClassificationIdCounter.get(), classificationStorageObj);
            debugLog("storing " + JSON.stringify(classificationStorageObj));
            storage.set(classificationStorageObj.url, classificationStorageObj);
            //await nextPageClassificationIdCounter.increment();
            resultListener({...data, ...pageContent.context});
        }
        // fetch worker associated with this
        let worker = workers.get(workerId);
        // send page content as a message to the classifier script
        worker.postMessage({
            type: "classify",
            payload: pageContent,
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

export function messageWorker(workerId, pageContent, callback) {
    function workerError(err) {
        debugLog(err.message + err.filename + err.lineno);
    }
    async function resultReceiver(result) {
        let data = result.data;
        let classificationStorageObj = {...data, ...pageContent.context};
        debugLog("storing " + JSON.stringify(classificationStorageObj));
        //storage.set("" + nextPageClassificationIdCounter.get(), classificationStorageObj);
        storage.set(classificationStorageObj.url, classificationStorageObj);
        //await nextPageClassificationIdCounter.increment();
        callback({...data, ...pageContent.context});
    }
    let worker = workers.get(workerId);
    worker.postMessage({
        type: "classify",
        payload: pageContent,
    });
    worker.addEventListener('message', async (result) => { await resultReceiver(result)});
    worker.addEventListener('error', workerError);
}

export async function lookupClassificationResult(url, workerId) {
    initialize();
    var result = await storage.get(url);
    if (result && result.type == workerId) return result;
    return null;
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
 * @param {string} workerId unique identifier for the classifier
 * @param {function} listener Callback for classification result
 */
export async function registerPageClassifier(matchPatterns, classifierFilePath, initArgs, workerId, listener) {
    initialize();
    // TODO: check that id is not in use
    if(workerId in workers) {
        debugLog("worker exists with same name");
        return;
    }

    workers.set(workerId, setupClassifier(workerId, classifierFilePath, initArgs));
    // setup content scripts for extracting content from matched pages
    await registerContentScript(matchPatterns, workerId);
    // setup comunication with worker via message passing
    listenForContentScriptMessages(workerId, listener);

}

/**
 * A helper function for initializing classifier 
 * @param {string} workerId unique identifier for the classifier
 * @param {string} classifierFilePath location of the classifier script
 * @param {Object} initArgs initialization data for the classifier
 */
function setupClassifier(workerId, classifierFilePath, initArgs) {
    let worker = new Worker(classifierFilePath);
    worker.postMessage({
        type: "init",
        name: workerId,
        args : initArgs
    });
    return worker;
}
