/**
 * Present surveys to the user.
 * @module WebScience.Utilities.userSurvey
 */

import * as Storage from "./Storage.js"
import * as Debugging from "./Debugging.js"

var storage = null;

const debugLog = Debugging.getDebuggingLog("Utilities.UserSurvey");

browser.privileged.onSurveyPopup.addListener((url) => {
    debugLog(url);
    browser.tabs.create({
        url: url
    });
});

function scheduleSurvey(surveyUrl, surveyTime) {
    browser.alarms.onAlarm.addListener(function () {
        browser.privileged.createSurveyPopup(surveyUrl, surveyTime);
    });
    browser.alarms.create(
        "surveyAlarm",
        { when: surveyTime }
    );
}
/**
 * Schedule a survey.
 * @param {string} surveyUrl - the website to send the user to
 * @param {number} surveyTimeAfterInitialRun - amount of time to wait before presenting survey
 */
export async function runStudy({
    surveyUrl,
    surveyTimeAfterInitialRun
}) {
    storage = await(new Storage.KeyValueStorage("WebScience.Measurements.UserSurvey")).initialize();
    var surveyTime = await storage.get("surveyTime");
    // create listeners
    if (0) {
        if (surveyTime < Date.now()) {
            scheduleSurvey(surveyUrl, surveyTime);
        } else {
            browser.privileged.createSurveyPopup(surveyUrl, browser.windows);
        }
    } else {
        surveyTime = surveyTimeAfterInitialRun + Date.now();
        await storage.set("surveyTime", surveyTime);
        scheduleSurvey(surveyUrl, surveyTime);
    }
}