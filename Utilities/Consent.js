/**
 * Present surveys to the user.
 * @module WebScience.Utilities.userSurvey
 */

import * as Storage from "./Storage.js"
import * as Debugging from "./Debugging.js"
import * as Messaging from "./Messaging.js"
import * as Scheduling from "./Scheduling.js"

var storage = null;

var callback = null;

const secondsPerDay = 86400;
const millisecondsPerSecond = 1000;

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
        url: "/study/notice.html"
    });
}

async function gainConsent() {
    var hasConsent = await storage.get("hasConsent");
    if (!hasConsent) {
        await storage.set("hasConsent", true);
        callback()
    }
}

function consentRefused() {
    browser.management.uninstallSelf();
}

async function dayListener() {
    var hasConsent = await storage.get("hasConsent");
    var installTime = await storage.get("installTime");
    if (!hasConsent && installTime + (secondsPerDay * millisecondsPerSecond) <= Date.now()){
        consentRefused();
    }
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
    Messaging.registerListener("WebScience.Utilities.Consent.agree", gainConsent);
    Messaging.registerListener("WebScience.Utilities.Consent.disagree", consentRefused);
    Messaging.registerListener("WebScience.Utilities.Consent.openNotice", openConsentTab);
    var hasConsent = await storage.get("hasConsent");
    if (hasConsent == null) {
        await storage.set("hasConsent", false);
        await storage.set("installTime", Date.now());
        // If we make it to 24 hours with no consent, assume they don't consent and uninstall
        Scheduling.registerIdleDailyListener(dayListener);
        openConsentTab();
    } else if (hasConsent) {
        callback();
        return;
    } else {
        Scheduling.registerIdleDailyListener(dayListener);
    }

}
