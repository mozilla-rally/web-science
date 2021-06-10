/**
 * This module enables subscribing to periodic events, currently on a daily or
 * weekly schedule.
 * 
 * The module guarantees a lower bound on when the event will fire, rather than
 * a precise time for when the event will fire. This constraint is because
 * the browser may not be open when the event would next fire, and because the
 * module attempts to wait for an idle state to avoid browser jank.
 * 
 * The heuristic for determining when to fire the next idle daily event is
 * identical to the heuristic used for the `idle-daily` event issued by the
 * Firefox [`nsIdleService`](https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIIdleService).
 * 
 * 1. Wait a day since the most recent idle daily event, or if the extension
 *    was just installed, wait a day after install.
 * 2. Listen for the next idle state, with a detection interval of 3 minutes.
 * 3. If an idle state does not occur within 24 hours, shorten the detection
 *    interval to 1 minute.
 * 
 * The idle daily event fires as soon as the browser enters an idle state that
 * satisfies the heuristic. The idle weekly event fires just after an idle
 * daily event when it has been at least 7 days since the last idle weekly
 * event.
 * 
 * Some implementation quirks to be aware of for use and future development:
 * 
 *   * This module does not subscribe to the `idle-daily` event from the
 *     `nsIdleService` to minimize privileged extension code and so that it
 *     runs on a different schedule from Firefox daily tasks (e.g., Telemetry).
 * 
 *   * This module uses `setTimeout` to handle corner cases where the browser
 *     goes idle before the idle daily event should fire and remains idle
 *     through when the idle daily event should fire. The timeouts are
 *     configured on startup (and periodically) based on timestamps in
 *     persistent storage, so it is not a problem that timeouts do not
 *     persist between browser sessions.
 * 
 * @module scheduling
 */

import * as idle from "./idle.js";
import * as storage from "./storage.js";
import * as events from "./events.js";
import * as timing from "./timing.js";

/**
 * The number of seconds in a day.
 * @private
 * @constant {number}
 * @default
 */
const secondsPerDay = 86400;

/**
 * The ordinary idle state detection interval (in seconds) to use for
 * firing idle daily and idle weekly events. This is the same value
 * (180 seconds = 3 minutes) used in the Firefox `nsIdleService`.
 * @private
 * @constant {number}
 * @default
 */
const idleIntervalInSeconds = 180;

/**
 * The shortened idle state detection interval (in seconds) to use
 * for firing idle daily and idle weekly events. The shortened
 * value is used when it has been longer than `shortenedIdleIntervalThresholdInSeconds`
 * seconds since one day after the `lastIdleDailyTime`. This is the
 * same value (60 seconds = 1 minute) used in the Firefox
 * `nsIdleService`.
 * @private
 * @constant {number}
 * @default
 */
const shortenedIdleIntervalInSeconds = 60;

/**
 * The threshold (in seconds) after the latest idle daily event
 * plus one day to start using the shortened idle state detection
 * interval. This is the same value (86400 seconds = 1 day) used
 * in the Firefox `nsIdleService`.
 * @private
 * @constant {number}
 * @default [secondsPerDay]
 */
const shortenedIdleIntervalThresholdInSeconds = secondsPerDay;

/**
 * The time (in milleconds since the epoch) when the module
 * most recently fired an idle daily event.
 * @private
 * @type {number}
 */
let lastIdleDailyTime;

/**
 * The time (in milleconds since the epoch) when the module
 * most recently fired an idle weekly event.
 * @private
 * @type {number}
 */
let lastIdleWeeklyTime;

/**
 * A storage.KeyValueStorage instance for persisting state on the most
 * recent idle daily and idle weekly event times.
 * @private
 * @type {(Object|null)}
 * @default
 */
let storageSpace = null;

/**
 * The timeout ID (from `setTimeout`) for the most recent
 * timeout listener.
 * @private
 * @type {number}
 */
let timeoutId = -1;

/**
 * Add a listener for the `onIdleDaily` event.
 * @function addListener
 * @memberof module:scheduling.onIdleDaily
 * @param {Function} listener - The listener to add.
 */

/**
 * Remove a listener for the `onIdleDaily` event.
 * @function removeListener
 * @memberof module:scheduling.onIdleDaily
 * @param {Function} listener - The listener to remove.
 */

/**
 * Check whether a specified listener has been added for the `onIdleDaily` event.
 * @function hasListener
 * @memberof module:scheduling.onIdleDaily
 * @param {Function} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * Whether the `onIdleDaily` event has any listeners.
 * @function hasAnyListeners
 * @memberof module:scheduling.onIdleDaily
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * An event that fires about once a day, when the browser is idle.
 * @namespace
 */
export const onIdleDaily = events.createEvent({
    name: "webScience.scheduling.onIdleDaily",
    addListenerCallback: function() { initialize(); }
});

/**
 * Add a listener for the `onIdleWeekly` event.
 * @function addListener
 * @memberof module:scheduling.onIdleWeekly
 * @param {Function} listener - The listener to add.
 */

/**
 * Remove a listener for the `onIdleWeekly` event.
 * @function removeListener
 * @memberof module:scheduling.onIdleWeekly
 * @param {Function} listener - The listener to remove.
 */

/**
 * Check whether a specified listener has been added for the `onIdleWeekly` event.
 * @function hasListener
 * @memberof module:scheduling.onIdleWeekly
 * @param {Function} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * Whether the `onIdleWeekly` event has any listeners.
 * @function hasAnyListeners
 * @memberof module:scheduling.onIdleWeekly
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * An event that fires about once a week, when the browser is idle.
 * @namespace
 */
export const onIdleWeekly = events.createEvent({
    name: "webScience.scheduling.onIdleWeekly",
    addListenerCallback: function() { initialize(); }
});

/**
 * Set a timeout and listener for when the ordinary and the shortened
 * idle state detection intervals take effect. This function accounts
 * for two unlikely corner case scenarios, where we have to query the
 * idle state because this module will not receive an idle state
 * change notification.
 *   * When it has been a day since the last idle daily event,
 *     and the user has already been idle for the idle threshold.
 *   * When it has been two days since the last idle daily event,
 *     and the user has already been idle for the shortened idle
 *     threshold.
 * @private
 */
function setIdleStateDetectionTimeout() {
    // Clear any pending timeout. Note that it's OK to have a timeout ID
    // that is negative or that is for a timeout that has already fired.
    // `clearTimeout` will silently do nothing in those scenarios (per
    // the specification).
    clearTimeout(timeoutId);
    
    // Set a timeout with a delay equal to one day out from the most
    // recent idle daily event. Thresholded with a delay of 0 (fire
    // immediately) since the time could be in the past (e.g., if the
    // browser has not been open for a day).
    let timeoutDelay = Math.max(lastIdleDailyTime + (secondsPerDay * 1000) - timing.now(), 0);
    timeoutId = setTimeout(function() {
        // If the browser is already in an idle state with the ordinary
        // idle state detection interval, fire the idle events.
        if(idle.queryState(idleIntervalInSeconds) === "idle") {
            notifyListeners();
            return;
        }
        // If the browser is not in an idle state, set a timeout with
        // a delay for when we should start using the shortened idle
        // state detection interval. As above, the delay is thresholded
        // at 0. 
        timeoutDelay = Math.max(lastIdleDailyTime + (secondsPerDay * 1000) + (shortenedIdleIntervalThresholdInSeconds * 1000) - timing.now(), 0);
        timeoutId = setTimeout(function() {
            // If the browser is already in an idle state with the
            // shortened idle state detection interval, fire the idle
            // events.
            if(idle.queryState(shortenedIdleIntervalInSeconds) === "idle") {
                notifyListeners();
            }
        }, timeoutDelay);
    }, timeoutDelay);
}

/**
 * Notify idle daily and idle weekly event listeners. This function is
 * called whenever the idle daily heuristic is satisfied.
 * @private
 */
async function notifyListeners() {
    // Remember the new idle daily event time to reset the scheduling
    // heuristic.
    lastIdleDailyTime = timing.now();
    await storageSpace.set("lastIdleDailyTime", lastIdleDailyTime);

    onIdleDaily.notifyListeners();
    
    // Set a timeout to account for corner cases.
    setIdleStateDetectionTimeout();

    // If it's been less than a week since the most recent idle
    // weekly event, we're done.
    if(lastIdleDailyTime < (lastIdleWeeklyTime + (7 * secondsPerDay * 1000))) {
        return;
    }
    
    // Remember the new idle weekly event time to update scheduling
    // for the next idle weekly event.
    lastIdleWeeklyTime = lastIdleDailyTime;
    await storageSpace.set("lastIdleWeeklyTime", lastIdleWeeklyTime);

    onIdleWeekly.notifyListeners();
}

/**
 * A listener for idle state events from the Idle module, with the
 * ordinary idle state detection interval.
 * @param {string} newState - The new browser idle state.
 * @private
 */
async function idleStateListener(newState) {
    // If it's been less than a day since the most recent idle
    // daily event, ignore the idle state event.
    if(timing.now() < (lastIdleDailyTime + (secondsPerDay * 1000))) {
        return;
    }
    // If the browser has entered an idle state, fire the idle
    // events.
    if(newState === "idle") {
        await notifyListeners();
    }
}

/**
 * A listener for idle state events from the Idle module, with the
 * shortened idle state detection interval.
 * @param {string} newState - The new browser idle state.
 * @private
 */
async function shortenedIdleStateListener(newState) {
    // If it's been less than two days since the most recent idle
    // daily event, ignore the idle state event.
    if(timing.now() < (lastIdleDailyTime + (secondsPerDay * 1000) + (shortenedIdleIntervalThresholdInSeconds * 1000))) {
        return;
    }
    
    // If the browser has entered an idle state, fire the idle
    // events.
    if(newState === "idle") {
        await notifyListeners();
    }
}

/**
 * Whether the module has completed setup.
 * @private
 * @type {boolean}
 */
let initialized = false;

/**
 * Setup for the module. Runs only once.
 * @private
 */
async function initialize() {
    if(initialized) {
        return;
    }
    initialized = true;

    // Load the most recent idle daily and idle weekly event times
    // from persistent storage. If there are no stored times, that
    // means the extension has just been installed, and we should
    // use the current time.
    const currentTime = timing.now();
    storageSpace = storage.createKeyValueStorage("webScience.scheduling");

    lastIdleDailyTime = await storageSpace.get("lastIdleDailyTime");
    if(lastIdleDailyTime === null) {
        lastIdleDailyTime = currentTime;
        await storageSpace.set("lastIdleDailyTime", lastIdleDailyTime);
    }

    lastIdleWeeklyTime = await storageSpace.get("lastIdleWeeklyTime");
    if(lastIdleWeeklyTime === null) {
        lastIdleWeeklyTime = currentTime;
        await storageSpace.set("lastIdleWeeklyTime", lastIdleWeeklyTime);
    }

    // Register two listeners for idle state events from the Idle
    // module. One listener uses the ordinary idle state detection
    // interval and the other uses the shortened interval.
    idle.onStateChanged.addListener(idleStateListener, idleIntervalInSeconds);
    idle.onStateChanged.addListener(shortenedIdleStateListener, shortenedIdleIntervalInSeconds);

    // Set a timeout to account for corner cases with idle state
    // events.
    setIdleStateDetectionTimeout();
}
