/**
 * This module is used for setting consent configuration, requesting
 * consent, and listening for changes in consent.
 * 
 * @module WebScience.Utilities.Consent
 */

import {
  getDebuggingLog
} from './Debugging.js';

import * as Storage from "./Storage.js"
import * as Messaging from "./Messaging.js"
import {SHIELD_URL} from "./UserSurvey.js"

const debugLog = getDebuggingLog("Utilities.Consent");

 /**
  * A flag for whether this study needs individual consent, rather than
  * just general consent for studies.
  * @type {boolean}
  * @private
  */
var studySpecificConsentRequired = true;
 /**
  * A flag for whether the study (in the general sense) has been started.
  * @type {boolean}
  * @private
  */
var studyCurrentlyRunning = false;

/*  Consent - components related to checking for and obtaining user consent. */

/**
 * A KeyValueStore object for data associated with consent
 * @type {Object}
 * @private
 */
var storage = null;
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
 * Disable the requirement for study-specific consent
 * (For studies that involve no intervention and only
 * privacy-preserving data collection)
 */
export function disableStudySpecificConsent() {
  studySpecificConsentRequired = false;
}

/**
 * Enable (enabled by default) the requirement for study-specific consent
 * (For studies that have an intervention or include
 * data collection without strong privacy guarantees)
 */
export function enableStudySpecificConsent() {
  studySpecificConsentRequired = true;
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
 * Return whether the study is enabled.
 * A study is enabled if we either have consent for it, or if
 * consent is not required, due to the specifics of the study.
 * @returns {boolean}
 */
export async function checkStudySpecificConsent() {
  var consent = await storage.get("studySpecificConsent");
  return consent || !studySpecificConsentRequired;
}

/**
 * Save the new setting of the consent for this study
 * and call the listeners to start or stop the study, if appropriate.
 * If the user is removing consent, prompt to uninstall the extension.
 * @param {boolean} consent - the new consent setting
 */
export async function saveStudySpecificConsent(consent) {
  await storage.set("studySpecificConsent", consent);
  if (!consent) { 
    if (studyCurrentlyRunning) { endStudy(); }
    // TODO: send request in next telemetry ping to delete remote data
    browser.management.uninstallSelf({
      showConfirmDialog: true,
      dialogMessage: "Uninstalling the extension will stop all current information collection for this study. \
If you'd still like to participate in the study, you may keep the extension installed and re-enable the study.\n"
      // TODO: add "Data already collected will be deleted." once we've done that part.
    }).then(null, () => {});
  }
  else if (consent && !studyCurrentlyRunning) { startStudy(); }
}

browser.privileged.onConsentPopup.addListener((value) => {
    debugLog("consent value ( 0 Learn more, 1 : Agree, -1 : Disagree) = "+ value);
    switch(value) {
      case 0:
        browser.tabs.create({
          url : "https://github.com/citp/news-disinformation-study"
        });
        break;
      case 1:
        startStudy();
        break;
      case -1:
        endStudy();
        break;
    }
});

/**
 * After calling setup functions above, this requests
 * consent if it is necessary, and begins the study if not.
 */
export async function requestConsentAndBegin() {
  storage = await (new Storage.KeyValueStorage("WebScience.Utilities.Consent")).initialize();
  await storage.set("studySpecificConsent", false);

  Messaging.registerListener("WebScience.Options.saveStudySpecificConsent", (message) => {
    saveStudySpecificConsent(message.content.studySpecificConsent);
  },
  { studySpecificConsent: "boolean" });

  Messaging.registerListener("WebScience.Options.checkStudySpecificConsent", (message) => {
    return checkStudySpecificConsent();
  });

  // temp, pending choices about how we implement consent
  // Note that a dev build of Firefox is required to use the experimental API
  // To see the popup, comment out the call to disableStudySpecificConsent in
  // study.js (and run dev FF)
  if (studySpecificConsentRequired) { browser.privileged.createConsentPopup(SHIELD_URL); }
  else { startStudy(); }
}