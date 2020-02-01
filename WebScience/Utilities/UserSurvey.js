/**
 * Present surveys to the user.
 * @module WebScience.Utilities.userSurvey
 */
import * as WebScience from "../WebScience.js"

var storage = null;

/**
 * Schedule a survey.
 * @param {string} surveyUrl - the website to send the user to
 * @param {number} surveyTimeAfterInitialRun - amount of time to wait before presenting survey
 */
export async function runStudy({
    surveyUrl,
    surveyTimeAfterInitialRun
}) {
    storage = await(new WebScience.Utilities.Storage.KeyValueStorage("WebScience.Studies.UserSurvey")).initialize();
    var surveyTime = await storage.get("surveyTime");
    if (surveyTime) {
        if (surveyTime < Date.now()) {
            browser.alarms.onAlarm.addListener(function () {
                browser.privileged.createSurveyPopup(surveyUrl);
            });
            browser.alarms.create(
                "surveyAlarm",
                { when: surveyTime["surveyTime"] }
            );
        } else {
            browser.privileged.createSurveyPopup(surveyUrl);
        }
    } else {
        var now = Date.now();
        surveyTime = surveyTimeAfterInitialRun + now;
        await storage.set("surveyTime", surveyTime);
        browser.alarms.onAlarm.addListener(function () {
            browser.privileged.createSurveyPopup(surveyUrl);
        });
        browser.alarms.create(
            "surveyAlarm",
            { when: surveyTime }
        );
    }
}