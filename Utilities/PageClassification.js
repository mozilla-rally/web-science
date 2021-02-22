/**
 * Classify web pages based on their content, title, and URL
 * Inject content scripts to  scripts   using an arbitrary classifier in reponse to messages from content scripts
 * @module WebScience.Utilities.PageClassification
 */
import * as Messaging from "../Utilities/Messaging.js";
import * as Debugging from "../Utilities/Debugging.js";
import * as Matching from "../Utilities/Matching.js";
import * as Events from "../Utilities/Events.js";
import * as Readability from "../Utilities/Readability.js"

const debugLog = Debugging.getDebuggingLog("Utilities.PageClassification");


class ClassificationEvent extends Events.Event {
    constructor(args) {
        super(args);
        this.workers = {};
        this.registeredCS = null;
        this.existingMatchPatterns = null;
    }

    async addListener(listener, options) {
        super.addListener(listener, options);
        if (options.workerId in this.workers) {
            debugLog(`Adding listener for same worker ${options.workerId}`);
            return;
        }

        if (this.registeredCS == null) this.listenForContentScriptMessages();
        await this.registerContentScripts(options.matchPatterns);

        const newWorker = {
            workerId: options.workerId,
            filePath: options.filePath,
            matchPatterns: options.matchPatterns,
            matchRegExp: Matching.matchPatternsToRegExp(options.matchPatterns),
            workerObj: new Worker(options.filePath),
            initialArgs: options.initArgs
        };
        newWorker.workerObj.onmessage = this.resultReceiver.bind(this);
        newWorker.workerObj.onerror = (e) => {console.log(e);};

        newWorker.workerObj.postMessage({
            type: "init",
            name: options.workerId,
            args: options.initArgs
        });

        this.workers[options.workerId] = newWorker;

    }

    notifyListeners(listenerArguments) {
        super.notifyListeners(listenerArguments);
    }

    removeListener(listener) {
        //unregisterClassifier(listener);
        super.removeListener(listener);
    }

    resultReceiver(result) {
        const data = result.data;
        data.url = Matching.normalizeUrl(data.url);
        const classificationResult = {...data};//, ...pageContent.context};
        this.notifyListeners([classificationResult]);
    }
    /**
     * Listen for messages from content script, pass them to classifier, listens for
     * classification results and sends back results to the registered result
     * listener function
     *
     */
     listenForContentScriptMessages() {
        Messaging.registerListener("WebScience.Utilities.PageClassification.pageContent", (pageContent, sender) => {
            if (!("tab" in sender)) {
                debugLog("Warning: unexpected message");
                return;
            }
            // add tab id to metadata
            pageContent.context["tabID"] = sender.tab.id;

            // fetch worker associated with this
            for (const workerName in this.workers) {
                const worker = this.workers[workerName]
                if (worker.matchRegExp.test(pageContent.url)) {
                    worker.workerObj.postMessage({
                        type: "classify",
                        payload: pageContent,
                    });
                }
            }
        });
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
    async registerContentScripts(newMatchPatterns) {
        if (this.existingMatchPatterns == null) this.existingMatchPatterns = new Set();
        const numExistingMatchPatterns = this.existingMatchPatterns.size;

        newMatchPatterns.forEach((matchPattern) => {
            this.existingMatchPatterns.add(matchPattern);
        });

        const numTotalMatchPatterns = this.existingMatchPatterns.size;
        if (numExistingMatchPatterns == numTotalMatchPatterns) return;

        // otherwise, we need to get rid of the old ones and re-register with the new
        // set of match patterns
        if (this.registeredCS) this.registeredCS.unregister();

        this.registeredCS = await browser.contentScripts.register({
            matches: [...this.existingMatchPatterns],
            js: [
                {
                    file: "/WebScience/Utilities/content-scripts/Readability.js"
                },
                {
                    file: "/WebScience/Utilities/content-scripts/page-content.js"
                },
                {
                    file: "/WebScience/Utilities/Ngrams.js"
                }
            ],
            runAt: "document_idle"
        });
    }

    fetchClassificationResult(url, workerId) {
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
                this.messageWorker(workerId, toSend);
            });
        });
    }

    messageWorker(workerId, pageContent) {
        const worker = this.workers[workerId];
        worker.workerObj.postMessage({
            type: "classify",
            payload: pageContent,
        });
    }

}

export const onClassificationResult = new ClassificationEvent(
    {notifyListenersCallback: filterResults});

function filterResults(listener, results, options) {
    return results[0].type == options.workerId;
}

export function fetchClassificationResult(url, workerId) {
    onClassificationResult.fetchClassificationResult(url, workerId);
}
