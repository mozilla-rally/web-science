import * as Studies from "/WebScience/Studies/Studies.js"
export { Studies }

import * as Utilities from "/WebScience/Utilities/Utilities.js"
export { Utilities }

/* Module Variables */

var studySpecificConsentRequired = true;

/*  Consent - components related to checking for and obtaining user consent. */

export function disableStudySpecificConsent() {
  studySpecificConsentRequired = false;
}

// TODO implement logic for pausing studies until the user consents, if consent
// is needed for a study
export function requestConsent() {
  browser.runtime.openOptionsPage();
}
