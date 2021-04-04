/**
 * Present surveys to the user.
 * @module webScience.userSurvey
 */
import * as storage from "./storage.js"
import * as messaging from "./messaging.js"

let storageSpace = null;

/**
 * The fully-qualified URL to Princeton shield image
 * @constant
 * @type {string}
 */
const SHIELD_URL = browser.runtime.getURL("images/Princetonshieldlarge.png");
// TODO -- wording, icon image
const surveyRequestMessage = "A new survey is available for your Ion study. Click the Princeton logo in the toolbar to continue.";
const surveyRequestTitle = "New Ion survey available";

const secondsPerDay = 86400;

const millisecondsPerSecond = 1000;

const surveyRemindPeriodDays = 3;

const surveyCompletionUrl = "https://citpsurveys.cs.princeton.edu/thankyou";

let surveyUrlBase = "";

/**
 * Generates a RFC4122 compliant ID
 * https://www.ietf.org/rfc/rfc4122.txt based on given seed.
 *
 * A compliant UUID is of the form
 * xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx; where 1 <= M <= 5
 * In this implementation M = 4.
 *
 * @param  {number} seed - seed. Example UTC milliseconds
 * @returns {string} - UUID
 */
function generateUUID(seed) {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        let r = Math.random() * 16;
        r = (seed + r) % 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

async function openSurveyTab(useSameTab = false) {
    const surveyId = await storageSpace.get("surveyId");
    const surveyUrlFull = surveyUrlBase +
        "?surveyId=" + surveyId +
        "&timezone=" + new Date().getTimezoneOffset();
    if (useSameTab) {
        browser.tabs.update({url: surveyUrlFull});
        return;
    }
    browser.tabs.create({
        active: true,
        url: surveyUrlFull
    });
}

async function requestSurvey(alarm) {
    if (alarm.name == "surveyAlarm") {
        const surveyCompleted = await storageSpace.get("surveyCompleted");
        const noRequestSurvey = await storageSpace.get("noRequestSurvey");
        if (surveyCompleted) return;
        if (noRequestSurvey) return;
        const currentTime = Date.now();
        await storageSpace.set("lastSurveyRequest", currentTime);
        browser.notifications.create({
            type: "image",
            message: surveyRequestMessage,
            title: surveyRequestTitle,
            iconUrl: SHIELD_URL
        });
        scheduleSurveyRequest(currentTime);
    }
}

function scheduleSurveyRequest(lastSurveyRequest) {
    browser.alarms.onAlarm.addListener(requestSurvey);
    browser.alarms.create("surveyAlarm", {
        when: lastSurveyRequest + (millisecondsPerSecond * secondsPerDay * surveyRemindPeriodDays)
    });
}

function handleSurveyCompleted() {
    storageSpace.set("surveyCompleted", true);
    setPopupSurveyCompleted();
}

function setPopupSurveyCompleted() {
    browser.browserAction.setPopup({
        popup: browser.runtime.getURL("study/completedSurvey.html")
    });
}

function cancelSurveyRequest() {
    storageSpace.set("noRequestSurvey", true);
    setPopupSurveyCompleted();
}

/**
 * Run a survey at scheduled survey time if it exists otherwise
 * current time + delta
 *
 * @param {string} surveyUrl - survey URL
 */
export async function runStudy({
    surveyUrl
}) {
    const currentTime = Date.now();
    surveyUrlBase = surveyUrl;

    storageSpace = new storage.KeyValueStorage("webScience.userSurvey");
    /* Check when we last asked the user to do the survey. If it's null,
     * we've never asked, which means the extension just got installed.
     * Open a tab with the survey, and save this time as the most recent
     * request for participation.
     */
    let lastSurveyRequest = await storageSpace.get("lastSurveyRequest");
    const surveyCompleted = await storageSpace.get("surveyCompleted");
    const noRequestSurvey = await storageSpace.get("noRequestSurvey");
    if (surveyCompleted || noRequestSurvey) {
        setPopupSurveyCompleted();
        await storageSpace.set("surveyCompleted", surveyCompleted);
        return;
    } else {
        browser.browserAction.setPopup({
            popup: browser.runtime.getURL("study/survey.html")
        });
    }

    // null means we've never asked before, so the extension was just enabled
    if (lastSurveyRequest == null) {
        lastSurveyRequest = currentTime;
        await storageSpace.set("lastSurveyRequest", lastSurveyRequest);
        await storageSpace.set("surveyCompleted", false);
        await storageSpace.set("noRequestSurvey", false);
        await storageSpace.set("surveyId", generateUUID(Date.now()));
        openSurveyTab(false);
    }
    /* Set a time to ask the user in three days (we won't actually ask
     * if they end up completing the survey before then).
     */
    scheduleSurveyRequest(lastSurveyRequest);
    /* The user gets directed to this page at the end of the survey, so
     * seeing a request for it means they did it -- stop bothering them
     */
    browser.webRequest.onBeforeRequest.addListener(
        handleSurveyCompleted,
        {urls: [ surveyCompletionUrl + "*" ]}
    );

    /* If the user tells us to never ask them again, we catch it with this message */
    messaging.registerListener("webScience.userSurvey.cancelSurveyRequest", cancelSurveyRequest);
    messaging.registerListener("webScience.userSurvey.openSurveyTab", () => { openSurveyTab(false); });
}

export async function getSurveyId() {
    return await storageSpace.get("surveyId");
}