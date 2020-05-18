
import * as Messaging from "../Utilities/Messaging.js";
import * as Debugging from "../Utilities/Debugging.js";

const debugLog = Debugging.getDebuggingLog("Measurements.PageClassification");

const workers = new Map();

async function registerContentScript(matchPatterns, name) {
    // setup content script injection

    var injectClassifierName = ['/* Inject classifier name: */ let name =  "' + name + '";',
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

function listenForCSMessages(name, listener) {
    Messaging.registerListener(name, (metadata, sender) => {
        if (!("tab" in sender)) {
            debugLog("Warning: unexpected metadata message");
            return;
        }
        /**
         * Handler for errors from worker threads
         * @param {Event} err - error 
         */
        function workerError(err) {
            debugLog("error :" + err);
        }
        function resultReceiver(result) {
            let data = result.data;
            //debugLog("received message from classification {" +
            //JSON.stringify(data) + "}. ");
            listener(data);
        }
        // fetch worker associated with this 
        let worker = workers.get(name);
        // send metadata as a message to the classifier script
        worker.postMessage({
            type: "classify",
            payload: metadata
        });
        // receive the result classification result.
        worker.addEventListener('message', resultReceiver);
        worker.addEventListener('error', workerError);
    }, {
        type: "string",
        url: "string",
        title: "string"
    });
}

export async function registerPageClassifier(matchPatterns, classifierFilePath, initArgs, name, listener) {
    // TODO : check that name is not in use
    if(name in workers) {
        debugLog("classifier exists with same name");
        return;
    }
    workers.set(name, setupClassifier(name, classifierFilePath, initArgs));
    // setup content scripts for extracting metadata from matched pages
    await registerContentScript(matchPatterns, name);
    // setup comunication with worker via message passing
    listenForCSMessages(name, listener);

}

function setupClassifier(classifierName, classifierFilePath, initArgs) {
    let worker = new Worker(classifierFilePath);
    worker.postMessage({
        type: "init",
        name: classifierName,
        args : initArgs
    });
    return worker;
}