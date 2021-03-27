/**
 * This module periodically runs analysis scripts (in a separate thread) and
 * reports the results.
 * @module webScience.utilities.dataAnalysis
 */

import { getDebuggingLog } from "./debugging.js";
import * as storage from "./storage.js";
import * as scheduling from "./scheduling.js";

const debugLog = getDebuggingLog("utilities.dataAnalysis");
/**
 * A Map that stores result listeners. The keys are worker script paths and the values
 * are Sets of message listeners associated with the worker script.
 * @private
 * @const {Map<string,Set<function>>}
 */
const resultRouter = new Map();

let storageSpace;

/**
 * Whether the module has completed setup.
 * @private
 * @type {boolean}
 */
let initialized = false;

let studyDomains = null;

let storageInstances = null;

/**
 * The end of the time range that the last aggregation run considered.
 * @private
 */
let lastAnalysisRangeEndTime;

/**
 * Setup for the module. Runs only once.
 * @private
 */
async function initialize() {
    if(initialized)
        return;
    initialized = true;
    debugLog("registering idle state listener for data analysis");
    storageSpace = new storage.KeyValueStorage();
    lastAnalysisRangeEndTime = await storageSpace.get("lastAnalysisRangeEndTime");
    if (lastAnalysisRangeEndTime == null) {
        lastAnalysisRangeEndTime = roundTimeUp(Date.now());
        await storageSpace.set("lastAnalysisRangeEndTime", lastAnalysisRangeEndTime);
    }
    console.log(lastAnalysisRangeEndTime);
    //Idle.registerIdleStateListener(idleStateListener, 1); // for testing
    scheduling.onIdleDaily.addListener(idleStateListener);
}

/**
 * A listener for idle state events from the Idle module
 * Triggers all analysis scripts that are registered to run
 * during idle state
 * @param {string} newState - The new browser idle state.
 * @private
 */
async function idleStateListener() {
    const currentTime = Date.now();
    const analysisStartTime = lastAnalysisRangeEndTime;
    const analysisEndTime = roundTimeDown(currentTime)
    if (lastAnalysisRangeEndTime < analysisEndTime) {
        lastAnalysisRangeEndTime = analysisEndTime;
        await storageSpace.set("lastAnalysisRangeEndTime", lastAnalysisRangeEndTime);
        await triggerAnalysisScripts(analysisStartTime, analysisEndTime);
    }
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
        const data = result.data;
        debugLog("received message from worker script {"+ JSON.stringify(data) + "}. Now passing it to listeners");
        for(const listener of listeners) {
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
export async function triggerAnalysisScripts(startTime, endTime) {
    const storageObjs = await storage.getEventsByRange(startTime, endTime, storageInstances);
    const toSend = {
        studyDomains: studyDomains,
        fromStorage: storageObjs,
    };

    for(const [scriptPath, listeners] of resultRouter) {
        const worker = new Worker(scriptPath);
        worker.postMessage(toSend);
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
async function registerAnalysisResultListener(workerScriptPath, listener) {
    await initialize();
    let resultListeners = resultRouter.get(workerScriptPath);
    if (resultListeners === undefined) {
        resultListeners = new Set();
        resultRouter.set(workerScriptPath, resultListeners);
    }
    resultListeners.add(listener);
}

function roundTimeUp(timeStamp) {
    const timeStampObj = new Date(timeStamp);
    const endHour = Math.ceil(timeStampObj.getUTCHours() / 4) * 4;
    return Date.UTC(timeStampObj.getUTCFullYear(), timeStampObj.getUTCMonth(),
                    timeStampObj.getUTCDay(), endHour) - 1;
}

function roundTimeDown(timeStamp) {
    const timeStampObj = new Date(timeStamp);
    const endHour = Math.floor(timeStampObj.getUTCHours() / 4) * 4;
    return Date.UTC(timeStampObj.getUTCFullYear(), timeStampObj.getUTCMonth(),
                    timeStampObj.getUTCDay(), endHour);
}

/**
 * Registers analysis scripts and associated listener functions.
 * For each analysis name (identified by object keys), the function expects a
 * script and listener for the result. The analysis script is scheduled to
 * execute in a worker thread during browser idle time. The results from
 * analysis script are forwarded to the listener function.
 *
 * @param {Object} scripts
 * @param {Object.any.path} path - path for analysis script
 * @param {Object.any.resultListener} path - Listener function for processing
 * the result from analysis script
 */
export async function runStudy(scripts, studyDomainsParam, storageInstancesParam) {
    studyDomains = studyDomainsParam;
    storageInstances = storageInstancesParam;
    for (const [, scriptParameters] of Object.entries(scripts)) {
        await registerAnalysisResultListener(scriptParameters.path, scriptParameters.resultListener);
    }
}
