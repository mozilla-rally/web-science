/**
 * Present surveys to the user.
 * @module WebScience.Utilities.userSurvey
 */

import * as Storage from "./Storage.js"
import * as Debugging from "./Debugging.js"

var storage = null;

/**
 * Logger object
 * 
 * @constant
 * @private
 * @type {function(string)}
 */
const debugLog = Debugging.getDebuggingLog("Utilities.UserSurvey");

/**
 * The fully-qualified URL to Princeton shield image
 * @constant
 * @type {string}
 */
export const SHIELD_URL = browser.runtime.getURL("images/Princetonshieldlarge.png");

browser.privileged.onSurveyPopup.addListener(async(url) => {
    debugLog("survey created for user" + url);
    let surveys = await storage.get("surveyUrls");
    if(!surveys) {
        surveys = new Array();
    }
    surveys.push(url);
    await storage.set("surveyUrls", surveys);
    debugLog("survey urls " + surveys);
    browser.tabs.create({
        url: url
    });
});

/**
 * Schedule a survey popup using privileged API
 * @param {string} surveyURLBase - Base URL for survey
 * @param {number} surveyTime - When to create survey popup
 */
function scheduleSurvey(surveyURLBase, surveyTime) {
    browser.alarms.onAlarm.addListener(function () {
        browser.privileged.createSurveyPopup(surveyURLBase, surveyTime, SHIELD_URL);
    });
    browser.alarms.create(
        "surveyAlarm",
        { when: surveyTime }
    );
}

/**
 * Run a survey at scheduled survey time if it exists otherwise 
 * current time + delta
 * 
 * @param {string} surveyURLBase - survey URL
 * @param {number} surveyTimeAfterInitialRun - amount of time to wait before presenting survey
 */
export async function runStudy({
    surveyURLBase,
    surveyTimeAfterInitialRun
}) {
    storage = await(new Storage.KeyValueStorage("WebScience.Measurements.UserSurvey")).initialize();
    var surveyTime = await storage.get("surveyTime");
    // create listeners
    if (surveyTime) {
        if (surveyTime < Date.now()) {
            scheduleSurvey(surveyURLBase, surveyTime);
        } else {
            browser.privileged.createSurveyPopup(surveyURLBase, Date.now(), SHIELD_URL);
        }
    } else {
        surveyTime = surveyTimeAfterInitialRun + Date.now();
        await storage.set("surveyTime", surveyTime);
        scheduleSurvey(surveyURLBase, surveyTime);
    }
}