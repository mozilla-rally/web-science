/**
 * This module facilitates timestamping events. We use the shared monotonic
 * clock specified by the W3C High Resolution Time spec, rather than the
 * ordinary system clock (i.e., `performance.timeOrigin + performance.now()`
 * instead of `Date.now()`).
 * 
 * The shared monotonic clock has important advantages over the system
 * clock: from browser startup to shutdown it only counts up, and it is
 * unaffected by user, application, or operating system adjustments other
 * than monotonic and small or gradual adjustments. The system clock, by
 * contrast, can change at any time, without any notice, to any value. The
 * user might manually adjust the clock, for example, or the operating
 * system might synchronize the clock to account for clock skew (e.g., NTP).
 * We use the shared monotonic clock because so much of WebScience and
 * browser-based research depends on accurate timestamps. A clock change
 * during study execution could introduce subtle bugs or other unexpected
 * behavior.
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
 *     tick during system sleep on certain platforms. Our aim is to have these
 *     bugs resolved on Firefox for Windows and macOS before launch.
 *  
 * @see {@link https://www.w3.org/TR/hr-time-2/}
 * @see {@link https://github.com/mdn/content/issues/4713}
 * @see {@link https://github.com/w3c/hr-time/issues/65}
 * @module timing
 */

/**
 * Get the current time from the shared monotonic clock, in milliseconds
 * since the epoch. This function is similar to `Date.now()`, but with
 * a different clock and submillisecond resolution. See the documentation
 * for the `timing` module for explanation of how the shared monotonic
 * clock compares to the ordinary system clock.
 * @returns {DOMHighResTimeStamp} The current time.
 */
export function now() {
    return window.performance.timeOrigin + window.performance.now();
}

/**
 * Convert a timestamp on the system clock to a timestamp on the shared
 * monotonic clock. Use this function only where strictly necessary,
 * and where it can be used immediately after the timestamp on the
 * system clock. There is a risk that the system clock will have
 * changed between the timestamp and now.
 * @param {number} timeStamp - A timestamp, in milliseconds since the
 * epoch, on the system clock.
 */
export function systemToSharedMonotonic(timeStamp) {
    return timeStamp - Date.now() + now();
}
