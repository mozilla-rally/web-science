/**
 * Classify web pages based on their content, title, and URL
 * Inject content scripts to scripts using an arbitrary classifier in reponse to
 * messages from content scripts
 * @module webScience.pageClassification
 */
import * as messaging from "./messaging.js";
import * as debugging from "./debugging.js";
import * as matching from "./matching.js";
import * as events from "./events.js";
import Readability from "@mozilla/readability";
import * as contentScripts from "./contentScripts.js"
import pageContentContentScript from "./content-scripts/pageContent.content.js"

const debugLog = debugging.getDebuggingLog("pageClassification");

const workers = { };
let registeredCS = null;
let existingMatchPatterns = null;

async function addListenerCallback(listener, options) {
    if (options.workerId in workers) {
        debugLog(`Adding listener for same worker ${options.workerId}`);
        return;
    }
    if (registeredCS === null) {
        listenForContentScriptMessages();
    }
    await registerContentScripts(options.matchPatterns);
    const newWorker = {
        workerId: options.workerId,
        filePath: options.filePath,
        matchPatterns: options.matchPatterns,
        matcher: new matching.MatchPatternSet([]),
        workerObj: new Worker(options.filePath),
        initialArgs: options.initArgs
    };
    newWorker.matcher.import(options.exportedMatcher);
    workers[options.workerId] = newWorker;
    newWorker.workerObj.onmessage = resultReceiver;
    newWorker.workerObj.onerror = (e) => {console.log(e);};

    newWorker.workerObj.postMessage({
        type: "init",
        name: options.workerId,
        args: options.initArgs
    });
}

function notifyListenersCallback(listener, listenerArguments, options) {
    return listenerArguments[0].type === options.workerId;
}

function resultReceiver(result) {
    const data = result.data;
    data.url = matching.normalizeUrl(data.url);
    const classificationResult = {...data};//, ...pageContent.context};
    onClassificationResult.notifyListeners([classificationResult]);
}

/**
 * Listen for messages from content script, pass them to classifier, listens for
 * classification results and sends back results to the registered result
 * listener function
 */
 function listenForContentScriptMessages() {
    messaging.registerListener("webScience.pageClassification.pageContent", (pageContent, sender) => {
        if (!("tab" in sender)) {
            debugLog("Warning: unexpected message");
            return;
        }
        // add tab id to metadata
        pageContent.context["tabID"] = sender.tab.id;

        // fetch worker associated with this
        for (const workerName in workers) {
            const worker = workers[workerName];
            if (worker.matcher.matches(pageContent.url)) {
                worker.workerObj.postMessage({
                    type: "classify",
                    payload: pageContent,
                });
            }
        }
    });
}

export const onClassificationResult = new events.createEvent({
    addListenerCallback,
    notifyListenersCallback
});

/**
 * Registers readability script for pages that belong to a set of patterns.
 *
 * Injects readability content scripts that match given patterns. The content
 * script extracts page metadata and sends it back.
 * @param {Array.string} matchPatterns - Match patterns of the form scheme://<host><path>
 * @param {string} workerId - an identifier for the background script and content
 * script to communicate
 */
async function registerContentScripts(newMatchPatterns) {
    if (existingMatchPatterns === null) {
        existingMatchPatterns = new Set();
    }
    const numExistingMatchPatterns = existingMatchPatterns.size;

    newMatchPatterns.forEach((matchPattern) => {
        existingMatchPatterns.add(matchPattern);
    });

    const numTotalMatchPatterns = existingMatchPatterns.size;
    if (numExistingMatchPatterns === numTotalMatchPatterns) {
        return;
    }

    // otherwise, we need to get rid of the old ones and re-register with the new
    // set of match patterns
    if (registeredCS !== null) {
        registeredCS.unregister();
    }

    registeredCS = await browser.contentScripts.register({
        matches: [...existingMatchPatterns],
        js: [{
            code: contentScripts.unpack(pageContentContentScript)
        }],
        runAt: "document_idle"
    });
}

export function fetchClassificationResult(url, workerId) {
    fetch(url).then((response) => {
        response.text().then((resp) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(resp, 'text/html');
            const pageContent = new Readability.Readability(doc).parse();
            const toSend = {
                url : url,
                title: pageContent.title,
                text : pageContent.textContent,
                pageId: null,
                context : {
                    timestamp : Date.now(),
                    referrer : ""
                }
            }
            messageWorker(workerId, toSend);
        });
    });
}

function messageWorker(workerId, pageContent) {
    const worker = workers[workerId];
    worker.workerObj.postMessage({
        type: "classify",
        payload: pageContent,
    });
}
