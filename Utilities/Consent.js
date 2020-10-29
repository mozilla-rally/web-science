/**
 * Present surveys to the user.
 * @module WebScience.Utilities.userSurvey
 */

import * as Storage from "./Storage.js"
import * as Debugging from "./Debugging.js"
import * as Messaging from "./Messaging.js"

var storage = null;

var callback = null;

/**
 * Logger object
 *
 * @constant
 * @private
 * @type {function(string)}
 */
const debugLog = Debugging.getDebuggingLog("Utilities.UserSurvey");

function openConsentTab() {
    browser.tabs.create({
        active: true,
        url: "/study/consent.html"
    });
}

async function gainConsent() {
    await storage.set("hasConsent", true);
    callback()
}

function consentRefused() {
    browser.management.uninstallSelf();
}

/**
 * Run a survey at scheduled survey time if it exists otherwise
 * current time + delta
 *
 * @param {string} surveyUrl - survey URL
 */
export async function runStudy(callbackAfterConsent) {
    var currentTime = Date.now();
    callback = callbackAfterConsent;

    storage = await(new Storage.KeyValueStorage("WebScience.Utilities.Consent")).initialize();
    /* Check when we last asked the user to do the survey. If it's null,
     * we've never asked, which means the extension just got installed.
     * Open a tab with the survey, and save this time as the most recent
     * request for participation.
     */
    var hasConsent = await storage.get("hasConsent");
    if (hasConsent == null) {
        openConsentTab();
    } else if (hasConsent) {
        callback();
        return;
    }

    /* If the user tells us to never ask them again, we catch it with this message */
    Messaging.registerListener("WebScience.Utilities.Consent.agree", gainConsent);
    Messaging.registerListener("WebScience.Utilities.Consent.disagree", consentRefused);
}
