import * as WebScience from "/WebScience/WebScience.js"
var studySpecificConsentRequired = true;
var studyCurrentlyRunning = false;

/*  Consent - components related to checking for and obtaining user consent. */

var storage = null;
var studyStartedListeners = [];
var studyEndedListeners = [];

/* Will be called in response to user/study actions, see study.js
 */
export function registerStudyStartedListener(studyStartedListener) {
  studyStartedListeners.push(studyStartedListener);
}

/* Will be called in response to user/study actions, see study.js
 */
export function registerStudyEndedListener(studyEndedListener) {
  studyEndedListeners.push(studyEndedListener);
}

/* For studies that involve no intervention and only
 *  privacy-preserving data collection, we can disable the
 *  requirement for consent specific to this study.
 */
export function disableStudySpecificConsent() {
  studySpecificConsentRequired = false;
}

/* For studies that have an intervention or include
 *  data collection without strong privacy guarantees,
 *  we must request study-specific consent.
 * This is enabled by default.
 */
export function enableStudySpecificConsent() {
  studySpecificConsentRequired = true;
}

/* This is used to indicate to the user whether the study is enabled.
 * A study is enabled if we either have consent for it, or if
 *  consent is not required, due to the specifics of the study.
 */
export async function checkStudySpecificConsent() {
  var consent = await storage.get("studySpecificConsent");
  return consent || !studySpecificConsentRequired;
}

function startStudy() {
  for (const listener of studyStartedListeners) {
    listener();
  }
  studyCurrentlyRunning = true;
}

function endStudy() {
  for (const listener of studyEndedListeners) {
    listener();
  }
  studyCurrentlyRunning = false;
}

/* Save the new setting of the consent for this study
 *  and, if we needed this consent, call the listeners to start or stop
 *  the study, respectively
 */
export async function saveStudySpecificConsent(consent) {
  await storage.set("studySpecificConsent", consent);
  if (!consent && studyCurrentlyRunning) { endStudy(); }
  else if (consent && !studyCurrentlyRunning) { startStudy(); }
}

/* After calling setup functions above, this requests
 *  consent if it is necessary, and begins the study if not
 */
export async function requestConsentAndBegin() {
  storage = await (new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Utilities.Consent")).initialize();
  await storage.set("studySpecificConsent", false);
  if (studySpecificConsentRequired) { browser.runtime.openOptionsPage(); }
  else { startStudy(); }
}

/* Need these for the options page code to see this version */
window.checkStudySpecificConsent = checkStudySpecificConsent;
window.saveStudySpecificConsent = saveStudySpecificConsent;