/**
 * This module is used for starting and stopping a study.
 * 
 * @module WebScience.Utilities.Lifecycle
 */

import {
    getDebuggingLog
} from './Debugging.js';

import * as Messaging from "./Messaging.js"
import {SHIELD_URL} from "./UserSurvey.js"

const debugLog = getDebuggingLog("Utilities.Lifecycle");

/**
 * A flag for whether the study (in the general sense) has been started.
 * @type {boolean}
 * @private
 */
var studyCurrentlyRunning = false;

/**
 * The set of functions listening for a study to start
 * @type {Array}
 * @private
 */
var studyStartedListeners = [];
/**
 * The set of functions listening for a study to stop
 * @type {Array}
 * @private
 */
var studyEndedListeners = [];

/**
 * A listener function for study start events.
 * @callback studyStartedListener
 */

/**
 * A listener function for study stop events.
 * @callback studyEndedListener
 */

/**
 * Registers a listener that will be called in response to
 * user/study actions, see study.js
 * @param {studyStartedListener} studyStartedListener
 */
export function registerStudyStartedListener(studyStartedListener) {
    studyStartedListeners.push(studyStartedListener);
}

/**
 * Registers a listener that will be called in response to
 * user/study actions, see study.js
 * @param {studyEndedListener} studyEndedListener
 */
export function registerStudyEndedListener(studyEndedListener) {
    studyEndedListeners.push(studyEndedListener);
}

/**
 * Call all the listeners registered for studies starting, and set
 * the flag to indicate that the study has started.
 * @private
 */
function startStudy() {
    for (const listener of studyStartedListeners) {
        listener();
    }
    studyCurrentlyRunning = true;
}

/**
 * Call all the listeners registered for studies ending, and set the
 * flag to indicate that the study has ended.
 * @private
 */
function endStudy() {
    for (const listener of studyEndedListeners) {
        listener();
    }
    studyCurrentlyRunning = false;
}


/**
 * Begins a study. Can be expanded to perform other generic setup
 * tasks before calling listeners.
 */
export async function requestBegin() {
    startStudy();
}
