/**
 * A module to facilitate surveys of study participants.
 * 
 * # User Experience
 *   * If the user has not been previously prompted for the survey,
 *     the survey will open in a new tab.
 *   * The study's browser action popup will contain either a page
 *     prompting the user complete the survey (with options to open
 *     the survey or decline the survey), or a neutral page (if the
 *     user has already completed or declined the survey).
 *   * If the user has been previously prompted for the survey, and
 *     has not completed or declined the survey, the user will be
 *     reminded to complete the survey with a browser notification
 *     at a set interval.
 * 
 * # Limitations
 * Note that this module is currently very limited: it only supports
 * one survey per study, with few options and a constrained design.
 * We have not yet decided whether to build out this module or implement
 * survey functionality in the Rally core add-on.
 * 
 * # Content Security Policy Requirements
 * This module depends on inline scripts in browser action popups, which
 * require special Content Security Policy permissions in the extension
 * manifest (the `"content_security_policy"` key). Those permissions
 * are currently the following additional `script-src` values.
 *   * `'sha256-7MkXA5Z7wxRyznhUZN3nVVs9GEQpvRXdYihZZqR2y6w='`
 *   * `'sha256-l+kgCjP15GJlVSDL9qMNffrHu8mxJcag42o2TYofOUM='`
 * @module webScience.userSurvey
 */
import * as id from "./id.js";
import * as storage from "./storage.js";
import * as messaging from "./messaging.js";
import * as inline from "./inline.js";
import popupPromptPage from "./html/userSurvey.popupPrompt.html";
import popupNoPromptPage from "./html/userSurvey.popupNoPrompt.html";

/**
 * A persistent storage space for data about surveys.
 * @type {storage.KeyValueStorage}
 * @private
 */
let storageSpace = null;

/**
 * Whether a survey has already been created. This module
 * currently only supports one survey per study.
 * @type {boolean}
 * @private
 */
let createdSurvey = false;

// Module-wide variables for a survey, set in createSurvey
let lastSurveyRequest = 0;
let reminderIconUrl = "";
let reminderInterval = 0;
let reminderMessage = "";
let reminderTitle = "";
let surveyUrl = "";

const millisecondsPerSecond = 1000;

/**
 * Opens the survey URL in a new browser tab, appending parameters
 * for the participant's survey ID (surveyID) and timezone offset
 * (timezone).
 * @private
 */
async function openSurveyInNewTab() {
    const surveyId = await getSurveyId();
    const surveyUrlObj = new URL(surveyUrl);
    surveyUrlObj.searchParams.append("surveyId", surveyId);
    surveyUrlObj.searchParams.append("timezone", new Date().getTimezoneOffset());
    browser.tabs.create({
        active: true,
        url: surveyUrlObj.href
    });
}

/**
 * Set a timeout to remind the user to complete the study.
 * @private
 */
function scheduleReminderForUser() {
    setTimeout(remindUser, Math.max((lastSurveyRequest + reminderInterval * millisecondsPerSecond) - Date.now(), 0));
}

/**
 * Remind the user to complete the study, by prompting with a notification.
 * @private
 */
async function remindUser() {
    const surveyCompleted = await storageSpace.get("surveyCompleted");
    const surveyCancelled = await storageSpace.get("surveyCancelled");
    if (surveyCompleted || surveyCancelled) {
        return;
    }
    lastSurveyRequest = Date.now();
    await storageSpace.set("lastSurveyRequest", lastSurveyRequest);
    browser.notifications.create({
        type: "image",
        message: reminderMessage,
        title: reminderTitle,
        iconUrl: reminderIconUrl
    });
    scheduleReminderForUser();
}

/**
 * Set the browser action popup to the survey's no prompt page.
 * @private
 */
function setPopupToNoPromptPage() {
    browser.browserAction.setPopup({
        popup: inline.dataUrlToBlobUrl(popupNoPromptPage)
    });
}

/**
 * Prompt the user to respond to a survey.
 * @param {Object} options - The options for the survey.
 * @param {string} options.popupNoPromptMessage - A message to present to the
 * user when there is no survey to prompt.
 * @param {string} options.popupPromptMessage - A message to present to the user
 * when there is a survey to prompt.
 * @param {string} options.reminderIcon - A path to an icon file, relative
 * to the study extension's root, to use for for reminding the user with a
 * notification to complete the survey.
 * @param {number} options.reminderInterval - How often, in seconds, to wait before
 * reminding the user with a notification to participate in the survey.
 * @param {string} options.reminderMessage - The message to use for reminding the
 * user with a notification to complete the survey.
 * @param {string} options.reminderTitle - The title to use for reminding the
 * user with a notification to complete the survey.
 * @param {string} options.surveyCompletionUrl - A URL that, when loaded,
 * indicates the user has completed the survey.
 * @param {string} options.surveyUrl - The URL for the survey on an external
 * platform (e.g., SurveyMonkey, Typeform, Qualtrics, etc.).
 */
export async function setSurvey(options) {
    if(createdSurvey) {
        throw new Error("userSurvey only supports one survey at present.");
    }
    createdSurvey = true;

    const currentTime = Date.now();
    surveyUrl = options.surveyUrl;
    reminderIconUrl = browser.runtime.getURL(options.reminderIcon);
    reminderInterval = options.reminderInterval;
    reminderTitle = options.reminderTitle;
    reminderMessage = options.reminderMessage;
    browser.storage.local.set({
        "webScience.userSurvey.popupPromptMessage": options.popupPromptMessage
    });
    browser.storage.local.set({
        "webScience.userSurvey.popupNoPromptMessage": options.popupNoPromptMessage
    });

    storageSpace = storage.createKeyValueStorage("webScience.userSurvey");
    /* Check when we last asked the user to do the survey. If it's null,
     * we've never asked, which means the extension just got installed.
     * Open a tab with the survey, and save this time as the most recent
     * request for participation.
     */
    let lastSurveyRequest = await storageSpace.get("lastSurveyRequest");
    const surveyCompleted = await storageSpace.get("surveyCompleted");
    const surveyCancelled = await storageSpace.get("surveyCancelled");
    lastSurveyRequest = await storageSpace.get("lastSurveyRequest");

    // Configure the browser action popup page
    if (surveyCompleted || surveyCancelled) {
        setPopupToNoPromptPage();
        return;
    }
    else {
        browser.browserAction.setPopup({
            popup: inline.dataUrlToBlobUrl(popupPromptPage)
        });
    }

    // If this is the first survey request, open the survey in a new tab
    if (lastSurveyRequest === null) {
        lastSurveyRequest = currentTime;
        await storageSpace.set("lastSurveyRequest", lastSurveyRequest);
        await storageSpace.set("surveyCompleted", false);
        await storageSpace.set("surveyCancelled", false);
        await storageSpace.set("surveyId", id.generateId());
        openSurveyInNewTab();
    }

    // Schedule a reminder for the user
    scheduleReminderForUser();

    // Set a listener for the survey completion URL
    browser.webRequest.onBeforeRequest.addListener(
        () => {
            storageSpace.set("surveyCompleted", true);
            setPopupToNoPromptPage();
        },
        { urls: [ (new URL(options.surveyCompletionUrl)).href + "*" ] }
    );

    // Set listeners for cancel and open survey button clicks in the survey request
    messaging.onMessage.addListener(() => {
        storageSpace.set("surveyCancelled", true);
        setPopupToNoPromptPage();
    }, { type: "webScience.userSurvey.cancelSurvey" });
    messaging.onMessage.addListener(openSurveyInNewTab, { type: "webScience.userSurvey.openSurvey" });
}

/**
 * Each study participant has a persistent survey ID, generated with
 * the id module. The ID is automatically added as a parameter to
 * the survey URL, enabling researchers to import survey data from an
 * external platform and sync it with Rally data.
 * @returns {string} - The participant's survey ID.
 */
export async function getSurveyId() {
    return await storageSpace.get("surveyId");
}
