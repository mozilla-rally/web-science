/**
 * This module periodically runs analysis scripts (in a separate thread) and
 * reports the results.
 * @module WebScience.Utilities.DataAnalysis
 */

import {
  getDebuggingLog
} from './Debugging.js';
import * as Idle from "./Idle.js"

const debugLog = getDebuggingLog("Utilities.DataAnalysis");
/**
 * A Map that stores result listeners. The keys are worker script paths and the values
 * are Sets of message listeners associated with the worker script.
 * @private
 * @const {Map<string,Set<function>>}
 */
const resultRouter = new Map();

/**
 * The number of seconds in a day.
 * @private
 * @const {number}
 * @default
 */
const secondsPerDay = 86400;

/**
 * Whether the module has completed setup.
 * @private
 * @type {boolean}
 */
var initialized = false;

/**
 * Setup for the module. Runs only once.
 * @private
 */
async function initialize() {
    if(initialized)
        return;
    initialized = true;
    // TODO : replace the interval with secondsPerDay in production
    debugLog("registering idle state listener for data analysis");
    Idle.registerIdleStateListener(idleStateListener, 1);
}

/**
 * A listener for idle state events from the Idle module
 * @param {string} newState - The new browser idle state.
 * @private
 */
async function idleStateListener(newState) {
    // If the browser has entered an idle state, fire the
    // analysis scripts
    debugLog("data analysis idle state listener triggered with state " + newState);
    if(newState === "idle")
        await triggerAnalysisScripts();
}

/**
 * Handler for errors from worker threads
 * @param {Event} err - error 
 */
function workerError(err) {
    debugLog("error :"+ err);
}

/**
 * Creates a receiver function for handling results from
 * worker script. The receiver function extracts the data part of the 
 * result and sends it to all the listeners waiting for it.
 * @param {Set<function>} listeners - listeners waiting for the results from
 * worker script
 * @returns {function} receiver function
 */
function createMessageReceiver(listeners) {
    function messageReceiver(result) {
        let data = result.data;
        debugLog("received message from worker script {"+ JSON.stringify(data) + "}. Now passing it to listeners");
        for(let listener of listeners) {
            listener(data.data);
        }
    }
    return messageReceiver;
}

/**
 * Trigger each analysis script in a separate worker thread
 * The result of analysis is passed on from the worker to the
 * registered listener function
 * @private
 */
export async function triggerAnalysisScripts() {
    for(let [scriptPath, listeners] of resultRouter) {
        debugLog("creating a worker with script "+ scriptPath);
        let worker = new Worker(scriptPath);
        worker.postMessage('run');
        worker.addEventListener('message', createMessageReceiver(listeners));
        worker.addEventListener('error', workerError);
    }
}

/**
 * Register an analysis script and a listener for the results.
 * The script runs in a worker thread every day
 * @param {string} workerScriptPath - location of the worker script
 * @param {function} listener - The listener function.
 */
export async function registerAnalysisResultListener(workerScriptPath, listener) {
    await initialize();
    var resultListeners = resultRouter.get(workerScriptPath);
    if (resultListeners === undefined) {
        resultListeners = new Set();
        resultRouter.set(workerScriptPath, resultListeners);
    }
    resultListeners.add(listener);
}

export async function runStudy(scripts) {
    for (let [scriptName, scriptParameters] of Object.entries(scripts)) {
        await registerAnalysisResultListener(scriptParameters.path, scriptParameters.resultListener);
    }
    await triggerAnalysisScripts();
}