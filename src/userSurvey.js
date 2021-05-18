/**
 * A module to facilitate surveys of study participants. See the
 * documentation for `setSurvey` for additional details about usage.
 * 
 * ## User Experience
 *   * If the user has not been previously prompted for the survey,
 *     the survey will open in a new tab.
 *   * The study's browser action popup will contain either a page
 *     prompting the user to complete the survey (with options to open
 *     the survey or decline the survey), or a neutral page (if the
 *     user has already completed or declined the survey).
 *   * If the user has been previously prompted for the survey, and
 *     has not completed or declined the survey, the user will be
 *     reminded to complete the survey with a browser notification
 *     at a set interval.
 * 
 * ## Limitations
 * Note that this module is currently very limited: it only supports
 * one survey at a time per study, with few options and a constrained design.
 * We have not yet decided whether to build out this module or implement
 * survey functionality in the Rally core add-on.
 * 
 * ## Content Security Policy Requirements
 * This module depends on inline scripts in browser action popups, which
 * require special Content Security Policy permissions in the extension
 * manifest (the `"content_security_policy"` key). Those permissions
 * are currently the following additional `script-src` values.
 *   * `'sha256-csyiOLMfXk2f5pU99mqYFyshgnVYbdp6o9bnQ9hntPA='`
 *   * `'sha256-nYNRfLKTaKqgi4+CK/mcp9hdSsmD8F17GWuo+vQGfqU='`
 * 
 * @module userSurvey
 */

import * as id from "./id.js";
import * as timing from "./timing.js";
import * as storage from "./storage.js";
import * as messaging from "./messaging.js";
import * as inline from "./inline.js";
import * as permissions from "./permissions.js";
import popupPromptPage from "./html/userSurvey.popupPrompt.html";
import popupNoPromptPage from "./html/userSurvey.popupNoPrompt.html";

/**
 * A persistent storage space for data about surveys.
 * @type {storage.KeyValueStorage}
 * @private
 */
let storageSpace = null;

/**
 * The ID of the survey reminder timeout (is null if there 
 * is no such timeout).
 * @type {number|null}
 * @private
 */
let reminderTimeoutId = null;

/**
 * Whether listeners for this module have already been registered.
 * @type {boolean}
 * @private
 */
let listenersRegistered = false;

/**
 * When we last asked the user to do the survey, either with a browser
 * notification or through opening a tab with the survey.
 * @type {number}
 * @private
 */
let lastSurveyRequest = 0;

/**
 * A fully-qualified URL to an icon file to use for for reminding the
 * user with a notification to complete the survey (is null if there is
 * no such icon).
 * @type {string|null}
 * @private
 */
let reminderIconUrl = null;

/**
 * How often, in seconds, to wait before reminding the user with a
 * notification to participate in the survey.
 * @type {number}
 * @private
 */
let reminderInterval = 0;

/**
 * The message to use for reminding the user with a notification to
 * complete the survey.
 * @type {string}
 * @private
 */
let reminderMessage = "";

/**
 * The title to use for reminding the user with a notification to
 * complete the survey.
 * @type {string}
 * @private
 */
let reminderTitle = "";

/**
 * The URL for the survey on an external platform
 * (e.g., SurveyMonkey, Typeform, Qualtrics, etc.).
 * @type {string}
 * @private
 */
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
    reminderTimeoutId = setTimeout(remindUser, Math.max((lastSurveyRequest + reminderInterval * millisecondsPerSecond) - timing.now(), 0));
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
    lastSurveyRequest = timing.now();
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
 * Initialize storage for the module.
 * @private
 */
function initializeStorage() {
    if (storageSpace === null) {
        storageSpace = storage.createKeyValueStorage("webScience.userSurvey");
    }
}

/**
 * Listener for webRequest.onBeforeRequest when the URL is the survey
 * completion URL. Sets surveyCompleted to true in storage and changes
 * the browser action popup to the survey's no prompt page.
 * @private
 */
function surveyCompletionUrlListener() {
    storageSpace.set("surveyCompleted", true);
    setPopupToNoPromptPage();
}

/**
 * Prompt the user to respond to a survey. There can only be one current survey at a time.
 * 
 * ##### Survey Behavior
 *   * If there is no current survey (i.e., if `setSurvey` was not previously called or
 *     `endSurvey` was called after `setSurvey`), this function creates a new current
 *     survey with the provided options, persists current survey details in storage, and
 *     configures survey UX.
 *   * If there is a current survey and `options.surveyName` matches the name of the
 *     current survey, this function continues the current survey with the details persisted
 *     in storage and configures survey UX.
 *   * If there is already a current survey and `options.surveyName` does not match the
 *     name of the current survey, throws an `Error` as there can only be one current survey
 *     at a time.
 * 
 * ##### Single-Survey Studies
 *   If your study involves a single survey, call `setSurvey` when you first want to prompt
 *   the user to complete the survey, then call `setSurvey` with an identical survey name on
 *   subsequent extension startups to continue the survey.
 * 
 * ##### Multi-Survey Studies
 *   If there is more than one survey in your study, you must call `endSurvey` for the current
 *   survey before calling `setSurvey` for the next survey.
 * 
 * @param {Object} options - The options for the survey.
 * @param {string} options.surveyName - A unique name for the survey within the study.
 * @param {string} options.popupNoPromptMessage - A message to present to the
 * user when there is no survey to prompt.
 * @param {string} options.popupPromptMessage - A message to present to the user
 * when there is a survey to prompt.
 * @param {string} [options.popupIcon] - A path to an icon file, relative
 * to the study extension's root, to use for for the browser action popup.
 * This property is optional as the popup does not need to display an icon.
 * @param {string} [options.reminderIcon] - A path to an icon file, relative
 * to the study extension's root, to use for for reminding the user with a
 * notification to complete the survey. This property is optional as the
 * notification does not need to display an icon.
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
    permissions.check({
        module: "webScience.userSurvey",
        requiredPermissions: [ "notifications", "webRequest" ],
        requiredContentSecurityPolicy: {
            "script-src": [ "'sha256-csyiOLMfXk2f5pU99mqYFyshgnVYbdp6o9bnQ9hntPA='", "'sha256-nYNRfLKTaKqgi4+CK/mcp9hdSsmD8F17GWuo+vQGfqU='" ]
        }
    });

    initializeStorage();

    let surveyDetails = await storageSpace.get("surveyDetails");

    // If there's no survey in storage, save the parameters in
    //    storage and carry out the survey based on the parameters.
    // If options.surveyName differs from the survey name in storage,
    //    throw an error, because only one survey can be set at a time.
    // Otherwise, options.surveyName is the same as the survey name in
    //    storage. In this case, use the survey attributes from storage.
    if (!surveyDetails) {
        surveyDetails = options;
        await storageSpace.set("surveyDetails", options);
    } else if (surveyDetails.surveyName !== options.surveyName) {
        throw new Error("userSurvey only supports one survey at a time. Complete the survey that has previously been set.");
    }

    const currentTime = timing.now();
    ({surveyUrl,reminderInterval, reminderTitle, reminderMessage } = surveyDetails);
    browser.storage.local.set({
        "webScience.userSurvey.popupPromptMessage": surveyDetails.popupPromptMessage
    });
    browser.storage.local.set({
        "webScience.userSurvey.popupNoPromptMessage": surveyDetails.popupNoPromptMessage
    });
    reminderIconUrl = surveyDetails.reminderIcon ?
        browser.runtime.getURL(surveyDetails.reminderIcon) : null;
    browser.storage.local.set({
        "webScience.userSurvey.popupIconUrl": 
            surveyDetails.popupIcon ? browser.runtime.getURL(surveyDetails.popupIcon) : null
    });

    // Check when we last asked the user to do the survey. If it's null,
    // we've never asked, which means the extension just got installed.
    // Open a tab with the survey, and save this time as the most recent
    // request for participation.
    lastSurveyRequest = await storageSpace.get("lastSurveyRequest");
    const surveyCompleted = await storageSpace.get("surveyCompleted");
    const surveyCancelled = await storageSpace.get("surveyCancelled");

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

    // If this is the first survey request, open the survey in a new tab.
    if (lastSurveyRequest === null) {
        lastSurveyRequest = currentTime;
        await storageSpace.set("lastSurveyRequest", lastSurveyRequest);

        // Since this is the first survey request, initialize the stored
        // completed and cancelled state to false.
        await storageSpace.set("surveyCompleted", false);
        await storageSpace.set("surveyCancelled", false);
        openSurveyInNewTab();
    }

    // Schedule a reminder for the user
    scheduleReminderForUser();

    // Set a listener for the survey completion URL.
    browser.webRequest.onBeforeRequest.addListener(
        surveyCompletionUrlListener,
        { urls: [ (new URL(surveyDetails.surveyCompletionUrl)).href + "*" ] }
    );

    // Listeners for cancel and open survey button click only need to be added once.
    // They do not need to be added again for subsequent calls to setSurvey.
    // These listeners do not need to be removed in endCurrentSurvey because they will
    // not receive messages when the popup is the no prompt page.
    if (!listenersRegistered) {
        // Set listeners for cancel and open survey button clicks in the survey request.
        messaging.onMessage.addListener(() => {
            storageSpace.set("surveyCancelled", true);
            setPopupToNoPromptPage();
            browser.webRequest.onBeforeRequest.removeListener(surveyCompletionUrlListener);
        }, { type: "webScience.userSurvey.cancelSurvey" });
        messaging.onMessage.addListener(() => {
            openSurveyInNewTab();
        }, { type: "webScience.userSurvey.openSurvey" });
    }

    listenersRegistered = true;
}

/**
 * Each study participant has a persistent survey ID, generated with
 * the `id` module. The ID is automatically added as a parameter to
 * the survey URL, enabling researchers to import survey data from an
 * external platform and sync it with Rally data. This method returns the
 * survey ID, generating it if it does not already exist.
 * @returns {Promise<string>} - The participant's survey ID.
 */
export async function getSurveyId() {
    initializeStorage();
    let surveyId = await storageSpace.get("surveyId");
    if (surveyId === null) {
        surveyId = id.generateId();
        await storageSpace.set("surveyId", surveyId);
    }
    return surveyId;
}

/**
 * Gets the status of the current survey. Can be used if a
 * subsequent survey depends on the status of the previous survey.
 * @returns {Promise<string>|Promise<null>} - The status of the current
 * survey ("completed", "cancelled", or "active"), or null if there is no
 * current survey.
 */
export async function getSurveyStatus() {
    initializeStorage();

    const surveyDetails = await storageSpace.get("surveyDetails");
    const surveyCompleted = await storageSpace.get("surveyCompleted");
    const surveyCancelled = await storageSpace.get("surveyCancelled");

    if (!surveyDetails) {
        return null;
    } else if(surveyCompleted) {
        return "completed";
    } else if(surveyCancelled) {
        return "cancelled";
    } else {
        return "active";
    }
}

/**
 * Gets the name of the current survey.
 * @returns {Promise<string>|Promise<null>} - The name of the current survey. Returns null
 * if there is no current survey.
 */
export async function getSurveyName() {
    initializeStorage();
    const surveyDetails = await storageSpace.get("surveyDetails");
    return surveyDetails ? surveyDetails.surveyName : null;
}

/**
 * End the current survey. If there is a current survey, you must call
 * this function before starting a new survey.
 * @returns {Promise} A Promise that resolves when the survey has been
 * ended.
 */
export async function endSurvey() {
    // Stop prompting for the survey.
    setPopupToNoPromptPage();

    // If there is an existing survey reminder timeout, clears the timeout.
    clearTimeout(reminderTimeoutId);

    // Remove any previously added listener for browser.webRequest.onBeforeRequest
    // that checks for the survey completion URL.
    browser.webRequest.onBeforeRequest.removeListener(surveyCompletionUrlListener);

    initializeStorage();

    // Clears the the data in storage for the current survey.
    await storageSpace.set("lastSurveyRequest", null);
    await storageSpace.set("surveyCompleted", false);
    await storageSpace.set("surveyCancelled", false);
    await storageSpace.set("surveyDetails", null);
}
