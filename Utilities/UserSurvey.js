/**
 * Present surveys to the user.
 * @module WebScience.Utilities.userSurvey
 */

import * as Storage from "./Storage.js"

var storage = null;

function scheduleSurvey(surveyUrl, surveyTime) {
    browser.alarms.onAlarm.addListener(function () {
        browser.privileged.createSurveyPopup(surveyUrl);
    });
    browser.alarms.create(
        "surveyAlarm",
        { when: surveyTime["surveyTime"] }
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
    if (surveyTime) {
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