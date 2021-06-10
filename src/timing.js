/**
 * This module facilitates timestamping events, using a standardized clock.
 * When supported by the browser, WebScience uses the shared monotonic clock
 * specified by the W3C High Resolution Time recommendation. Otherwise,
 * WebScience uses the system clock.
 * 
 * ## Web Browser Clocks
 * There are two clocks supported in modern web browsers.
 *   * __System Clock__ (`Date.now()` or `new Date`). The system clock is
 *     the ordinary time provided by the operating system. Using the
 *     system clock to timestamp events poses a risk: the user or operating
 *     system can adjust the clock at any time, for any reason, without any
 *     notice, to any value. The user might manually adjust the clock, for
 *     example, or the operating system might synchronize the clock to account
 *     for clock skew (e.g., NTP time sync). These adjustments can be large and
 *     non-monotonic, breaking assumptions that WebScience makes about timestamp
 *     proximity and ordering. A clock change during study execution could
 *     introduce subtle bugs or other unexpected behavior.
 *   * __Shared Monotonic Clock__
 *    (`performance.timeOrigin + performance.now()`). The W3C High Resolution
 *    Time recommendation specifies a shared monotonic clock. This clock
 *    should have the following properties:
 *      * strictly monotonic;
 *      * not subject to large or non-monotonic adjustments from any source;
 *      * consistent across cores, processes, threads, and globals down to the
 *        hardware level; and
 *      * synchronized to the system clock just once, on browser startup.
 *      
 * Our goal is to migrate WebScience and Rally studies to the shared monotonic
 * clock, because it does not have clock change risks like the system clock.
 * Unfortunately, browser implementations of High Resolution Time currently
 * depart from the W3C recommendation in significant ways that prevent reliance
 * on the shared monotonic clock. We will update this module as browsers correct
 * their implementations.
 * 
 * ## Additional Notes
 *   * The High Resolution Time spec describes a shared monotonic clock (which
 *     must be used to generate `performance.timeOrigin` for each global) and
 *     per-global monotonic clocks (which tick for  `performance.now()` and other
 *     uses of `DOMHighResTimeStamp`). Monotonic clocks on modern hardware are
 *     synchronized across cores, processes, and threads, so we treat
 *     `performance.timeOrigin + performance.now()` as the current time on the
 *     shared monotonic clock, even though the W3C spec doesn't _quite_ say that.
 *   * Firefox and Chrome currently depart from the High Resolution Time
 *     spec in significant ways: `performance.timeOrigin` is sometimes set from
 *     the system clock rather than the shared monotonic clock, and
 *     `performance.now()` (and other uses of `DOMHighResTimeStamp`) do not
 *     tick during system sleep on certain platforms.
 *  
 * @see {@link https://www.w3.org/TR/hr-time-2/}
 * @see {@link https://github.com/mdn/content/issues/4713}
 * @see {@link https://github.com/w3c/hr-time/issues/65}
 * @module timing
 */

/**
 * Get whether the browser supports the High Resolution Time shared
 * monotonic clock. Currently always returns `false`. We will update
 * this function as browser support improves.
 * @returns {boolean} Whether the browser supports the shared monotonic
 * clock.
 * @private
 */
function sharedMonotonicClockSupport() {
    return false;
}

/**
 * Get the current time, in milliseconds since the epoch, using a
 * standardized clock.
 * @returns {number} The current time, in milliseconds since the epoch.
 */
export function now() {
    if(sharedMonotonicClockSupport()) {
        return window.performance.timeOrigin + window.performance.now();
    }
    return Date.now();
}

/**
 * Convert a timestamp on the system clock to a timestamp on the
 * standardized clock. Use this function only where strictly necessary,
 * and where it can be used immediately after the timestamp on the
 * system clock. There is a risk that the system clock will have
 * changed between the timestamp and now.
 * @param {number} timeStamp - A timestamp, in milliseconds since the
 * epoch, on the system clock.
 * @returns {number} A timestamp, in milliseconds since the epoch, on
 * the standardized clock.
 * @example
 * const systemTimeStamp = Date.now();
 * const standardizedTimeStamp = webScience.timing.fromSystemClock(systemTimeStamp);
 */
export function fromSystemClock(timeStamp) {
    if(sharedMonotonicClockSupport()) {
        return timeStamp - Date.now() + window.performance.timeOrigin + window.performance.now();
    }
    return timeStamp;
}

/**
 * Convert a timestamp on the shared monotonic clock to a timestamp
 * on the standardized clock. Use this function only where strictly
 * necessary, and where it can be used immediately after the timestamp
 * on the monotonic clock. There is a risk that the system clock will
 * have changed between the timestamp and now or that the monotonic
 * clock was affected by an implementation bug.
 * @param {number} timeStamp - A timestamp, in milliseconds since the
 * epoch, on the shared monotonic clock.
 * @param {boolean} relativeToTimeOrigin - Whether the timestamp
 * is relative to a time origin (e.g., a DOM event or Performance API
 * timestamp), or the time origin has already been added to the
 * timestamp (e.g., `performance.timeOrigin` or
 * `performance.timeOrigin + performance.now()`).
 * @returns {number} A timestamp, in milliseconds since the epoch, on
 * the standardized clock.
 * @example
 * const monotonicTimeStamp = performance.timeOrigin;
 * const standardizedTimeStamp = webScience.timing.fromMonotonicClock(monotonicTimeStamp, false);
 * @example
 * const monotonicTimeStamp = performance.timeOrigin + performance.now();
 * const standardizedTimeStamp = webScience.timing.fromMonotonicClock(monotonicTimeStamp, false);
 * @example
 * const relativeMonotonicTimeStamp = performance.now();
 * const standardizedTimeStamp = webScience.timing.fromMonotonicClock(relativeMonotonicTimeStamp, true);
 */
export function fromMonotonicClock(timeStamp, relativeToTimeOrigin) {
    if(sharedMonotonicClockSupport()) {
        if(relativeToTimeOrigin) {
            return window.performance.timeOrigin + timeStamp;
        }
        return timeStamp;
    }
    if(relativeToTimeOrigin) {
        return timeStamp - window.performance.now() + Date.now();
    }
    return timeStamp - window.performance.now() - window.performance.timeOrigin + Date.now();
}
