/**
 * This module facilitates timestamping events. We use the global monotonic
 * clock specified by the High Resolution Time Level 2 standard, rather than
 * the ordinary system clock.
 * 
 * The global monotonic clock has important advantages over the system
 * clock: from browser startup to shutdown it only counts up, and it is
 * unaffected by user, application, or operating system adjustments. The
 * system clock, by contrast, can change at any time and without any notice.
 * The user might manually adjust the clock, for example, or the operating
 * system might synchronize the clock to account for clock skew (e.g., NTP).
 * We use the global monotonic clock because so much of WebScience and
 * browser-based research depends on timestamps. A clock change during study
 * execution could introduce subtle bugs or other unexpected behavior.
 * 
 * There is a downside to be aware of with the global monotonic clock: it can
 * experience clock drift, resulting in clock skew from the system clock and
 * the correct time. Anecdotally, the clock drift for a modern device should
 * be less than a couple of seconds per day in ordinary use, which should
 * result in tolerable levels of clock skew even when a participant leaves
 * their browser running for a lengthy period of time.
 * 
 * Note that Chrome does not correctly implement the High Resolution Time
 * Level 2 standard at present. The monotonic clock is per-process rather
 * than global, and the clock suspends when a process is not active. As a
 * result, there can be significant clock skew between tab monotonic clocks
 * and between a tab monotonic clock and the system clock.
 *  
 * @see {@link https://www.w3.org/TR/hr-time-2/}
 * @see {@link https://github.com/w3c/hr-time/issues/65}
 * @see {@link https://bugs.chromium.org/p/chromium/issues/detail?id=948384}
 * @see {@link https://bugs.chromium.org/p/chromium/issues/detail?id=166153}
 * @module webScience.timing
 */

/**
 * Get the current time from the global monotonic clock, in milliseconds
 * since the epoch. This function is similar to `Date.now()`, but with
 * a different clock and submillisecond resolution. See the documentation
 * for the `timing` module for explanation of how the global monotonic
 * clock compares to the ordinary system clock.
 * @returns {DOMHighResTimeStamp} The current time.
 */
export function now() {
    return window.performance.timeOrigin + window.performance.now();
}

/**
 * Convert a timestamp on the system clock to a timestamp on the global
 * monotonic clock. Use this function only where strictly necessary,
 * and where it can be used immediately after the timestamp on the
 * system clock. There is a risk that the system clock will have
 * changed between the timestamp and now.
 * @param {number} timeStamp - A timestamp, in milliseconds since the
 * epoch, on the system clock.
 */
export function systemToGlobalMonotonic(timeStamp) {
    return timeStamp - Date.now() + now();
}
