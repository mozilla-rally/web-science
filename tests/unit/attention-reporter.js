/**
 * This module contains function for initializing the attention reporting
 * and collecting in RS01 in a background script.
 * It is responsible for initialization through `startMeasurement` 
 * and exports a callback function
 * to consume the stream of attention and audio events, `onPageData`.
 * It handles the registration of [`attention-collector.js`](/RS01.module_attention-collector.html).
 * @example
 * import { startMeasurement, stopMeasurement, onPageData } from "./attention-reporter";
 * 
 * // Starts the measurement by activating the attention-collector.js content script.
 * // and creating new listeners for it.
 * startMeasurement();
 * 
 * // Initializes the page data callback.
 * onPageData(userEvent => {
 *  console.log('attention event collected', userEvent);
 * });
 * 
 * // Stop the measurement when some other arbitrary event fires.
 * // This will unregister the attention-collector.js content script
 * // and remove the associated listeners.
 * someOtherModule.onError(stopMeasurement);
 *
 * @module RS01.attention-reporter
 */

import browser from "webextension-polyfill";
import * as events from "../../src/events.js";
import * as messaging from "../../src/messaging.js";
import * as pageManager from "../../src/pageManager.js";

/** 
 * The generic interface that defines the shared properties for `AttentionEvent` and `AudioEvent`.
 * @typedef {Object} UserEvent
 * 
 * @property {string} pageId - The ID for the page, unique across browsing sessions.
 * @property {string} origin – the origin of the URL associated with the page visit. Calculated by applying new URL(url).origin.
 * See https://developer.mozilla.org/en-US/docs/Web/API/URL/origin
 * @property {string} referrerOrigin - The origin of the referrer URL for the page loading in the tab, or `""` if
 * there is no referrer.
 * @property {number} pageVisitStartTime - A unix timestamp (in miliseconds) when the page visit start event fired.
 * @property {number} pageVisitStopTime - A unix timestamp (in miliseconds) when the page visit stop event fired.
 * @property {number} duration - Time in miliseconds that the event lasted.
 * @property {string} reason - the reason the attention event ended.
 * @property {string} title - the page's <title> contents, taken from the <head> tag.
 * @property {string} description - the page's og:description <meta> tag, taken from the <head> tag.
 * @property {string} ogType - the page's og:type <meta> tag, taken from the <head> tag.
 * @property {number} eventStartTime - a unix timestamp in miliseconds specifying the start time of the event
 * @property {number} eventStopTime - a unix timestamp in miliseconds specifying the stop time of the event
 * @interface
 */

/** 
 * This web extension reports an attention event after the pageManager pageVisitStop and pageAttentionUpdate (when attention ends) events is fired.
 * See {@link UserEvent} for additional properties.
 * @typedef {Object} AttentionEvent
 * 
 * @implements {UserEvent}
 * @property {number} MaxPixelScrollDepth - The largest reported pixel value on the active page the user has scrolled.
 * @property {number} maxRelativeScrollDepth - The largest reported proportion of the active page that has been scrolled already.
 * @property {number} scrollHeight - The total scroll height of the page, taken from document.documentElement.scrollHeight.
 * @interface
 */

/** 
 * This web extension reports an audio event after the pageManager pageAudioUpdate event (when page ceases to have audio) is fired.
 * See {@link UserEvent} for additional properties.
 * @typedef {Object} AudioEvent
 * 
 * @implements {UserEvent}
 * @interface
 */

/**
 * A callback function for the page data event.
 * @callback pageDataCallback
 * @param {(AttentionEvent|AudioEvent)} details
 */

/**
 * Options when adding a page data event listener.
 * @typedef {Object} PageDataOptions
 * @property {Array<string>} [matchPattern=[]] - The webpages of interest for the measurement, specified with WebExtensions match patterns.
 * @property {boolean} [privateWindows=false] - Whether to measure pages in private windows.
 */

/**
 * Function to start measurement when a listener is added
 * @private
 * @param {EventCallbackFunction} listener - new listener being added
 * @param {PageDataOptions} options - configuration for the events to be sent to this listener
 */
function addListener(listener, options) {
    startMeasurement(options);
}

/**
 * Function to end measurement when the last listener is removed
 * @private
 * @param {EventCallbackFunction} listener - listener that was just removed
 */
function removeListener(listener) {
    if (!this.hasAnyListeners()) {
        stopMeasurement();
    }
}

/**
 * The registered page navigation content script.
 * @private
 * @type {RegisteredContentScript|null}
 */
let registeredContentScript = null;
/**
 * Whether to notify the page data listener about private windows.
 * @private
 */
let notifyAboutPrivateWindows = false;

/**
 * A function that is called when the content script sends a page data event message.
 * @private
 * @param {PageData} pageData - Information about the page.
 */
function pageDataListener(pageData) {
    // If the page is in a private window and the module should not measure private windows,
    // ignore the page
    if(!(notifyAboutPrivateWindows) && pageData.privateWindow) {
        return;
    }

    // Delete the type string from the content script message
    delete pageData.type;

    onPageData.notifyListeners([ pageData ]);
}

/**
 * This function will start the attention measurement. 
 * It
 * - initializes the pageManager module from WebScience 
 * - registers a content script, aattention-collector.js
 * - registers listeners RS01.attentionEvent and RS02.audioEvent
 * 
 * @function 
 * @param {PageDataOptions} options - A set of options for the measurement.
 */
export async function startMeasurement({
    matchPatterns = [ ],
    privateWindows = false,
}) {

    await pageManager.initialize();

    notifyAboutPrivateWindows = privateWindows;

    registeredContentScript = await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            file: "/dist/content-scripts/attention-collector.js"
        }],
        runAt: "document_start"
    });

    // Event properties that both of these event types consume.
    const sharedEventProperties = {
        pageId: "string",
        origin: "string",
        referrerOrigin: "string",
        eventType: "string",
        pageVisitStartTime: "number",
        pageVisitStopTime: "number",
        eventStartTime: "number",
        eventStopTime: "number",
        duration: "number",
        eventTerminationReason: "string",
        title: "string",
        ogType: "string",
        description: "string",
    }

    /**
     * Add listeners for each schema defined below.
     * Because WebScience's messaging module does not support optional fields
     * nor multiple field types, we will break out the attention collection from the audio collection.
     * When we submit the event to the endpoint, however, we make no distinction between the two, utilizing
     * the eventType property to distinguish the two cases.
     * See https://github.com/mozilla-rally/web-science/issues/33 for more information.
     * @event
     */
     messaging.registerListener("RS01.attentionCollection", pageDataListener, {
        ...sharedEventProperties,
        maxRelativeScrollDepth: "number",
        maxPixelScrollDepth: "number",
        scrollHeight: "number",
    });

    messaging.registerListener("RS01.audioCollection", pageDataListener, {
        ...sharedEventProperties
    });
}

/**
 * This function will stop the attention measurement. It unregisters the 
 * content script and all associated listeners.
 */
export async function stopMeasurement() {
    messaging.unregisterListener("RS01.attentionCollection", pageDataListener);    
    messaging.unregisterListener("RS01.audioCollection", pageDataListener);    
    registeredContentScript.unregister();
    registeredContentScript = null;
    notifyAboutPrivateWindows = false;
}

/**
 * An event that is fired when an attention event is emitted.
 * This is the main function to be consumed. `pageDataCallback` is a function
 * that has an `AudioEvent` or `AttentionEvent` as the first argument.
 * @type {Events.Event<pageDataCallback, pageDataListenerOptions>}
 */
 export const onPageData = events.createEvent({
    addListenerCallback: addListener,
    removeListenerCallback: removeListener});