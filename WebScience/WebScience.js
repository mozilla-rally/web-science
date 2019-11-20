import * as Studies from "/WebScience/Studies/Studies.js"
export { Studies }

/* Module Variables */

var studySpecificConsentRequired = true;

const debug = true;

/*  Consent - components related to checking for and obtaining user consent. */

export function disableStudySpecificConsent() {
  studySpecificConsentRequired = false;
}

// TODO implement logic for pausing studies until the user consents, if consent
// is needed for a study
export function requestConsent() {
  browser.runtime.openOptionsPage();
}

/* Utilities */

function debugLog(text) {
  if(debug == true)
    console.log(text);
}
