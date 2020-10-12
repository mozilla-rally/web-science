/**
 * Module for handling storage instances used across the study.
 * 1. Extract storage contents from storage instances
 * 2. Functions for time based subsets of study data
 * 3. Mark stale data for deletion
 * @module WebScience.Utilities.StorageManager
 */

import {
    getDebuggingLog
} from './Debugging.js';

import {
    storageInstances
} from "./Storage.js"
const debugLog = getDebuggingLog("Utilities.StorageManager");

const _MS_PER_DAY = 1000 * 60 * 60 * 24;
const _DAYS_PER_WEEK = 7;

/**
 * An object that stores the timestamp field for the storage modules.
 * @private
 * @constant
 */
const timePropertyMapping = {
    "WebScience.Measurements.LinkExposure": "firstSeen",
    "WebScience.Measurements.PageNavigation": "visitStart",
    "WebScience.Measurements.SocialMediaNewsExposure": "loadTime",
    "WebScience.Measurements.SocialMediaAccountExposure": "loadTime",
    "WebScience.Measurements.SocialMediaLinkSharing": "shareTime"
}

/**
 * Extracts a snapshot of the current storage across the study.
 * Modifications to the snapshot will not affect the underlying persisted storage.
 * 
 * @returns {Object} an object with module name as key and copy of current
 * storage as value
 */
async function getStorageObjs() {
    let stats = {};
    await Promise.all(storageInstances.map(async instance => {
        let key = instance.storageAreaName;
        let storageObj = await instance.getContentsAsObject();
        stats[key] = storageObj;
    }));
    return stats;
}

/**
 * Number of time intervals between a start and end time
 * @param {number} utc1 start time
 * @param {number} utc2 end time
 * @param {number} msInInterval number of milliseconds in each interval
 */
function utcDateDiffInIntervals(utc1, utc2, msInInterval) {
    return Math.floor((utc2 - utc1) / msInInterval);
}

/**
 * Number of days elapsed between start and end time
 * @param {number} utc1 start time
 * @param {number} utc2 end time
 */
const utcDateDiffInDays = function (utc1, utc2) {
    return utcDateDiffInIntervals(utc1, utc2, _MS_PER_DAY);
}


/**
 * Function to extract most recent events from a given time point.
 * A string property specifies the time key in each event.
 * @param {Object} obj Object containing events
 * @param {number} currentTime current time
 * @param {string} timeProperty name of the time property in each event
 * @param {number} msInInterval Width of interval measured milliseconds
 * @param {number} nIntervals number of intervals to look back
 * @returns {Object} Subset of the events
 */
function getRecentEvents(obj, currentTime, timeProperty, msInInterval, nIntervals) {
    return Object.keys(obj).reduce((acc, val) => {
        if (!(timeProperty in obj[val])) {
            return { ...acc,
                   [val]: obj[val]};
        }
        let diffIntervals = utcDateDiffInIntervals(obj[val][timeProperty], currentTime, msInInterval);
        return (diffIntervals > nIntervals) ? acc : {
            ...acc,
            [val]: obj[val]
        }
    }, {});
}


/**
 * Modify the snapshot to include only the most recent data
 * Uses time property defined in `timePropertyMapping`.
 * 
 * @param {Object} storageObjs Snapshot of storage
 * @param {number} msInInterval Width of interval measured in milliseconds
 * @param {number} nIntervals number of intervals to look back
 */
function filterStorageObjs(storageObjs, msInInterval, nIntervals) {
    let currentTime = Date.now();
    Object.entries(storageObjs).forEach(entry => {
        let key = entry[0];
        let value = entry[1];
        if (key in timePropertyMapping) {
            let filteredEvents = getRecentEvents(value, currentTime, timePropertyMapping[key], msInInterval, nIntervals);
            storageObjs[key] = filteredEvents;
        }
    });
}

/**
 * Get a snapshot of the most recent data in the storage
 * @param {number} msInInterval Width of interval measured in milliseconds
 * @param {number} nIntervals number of intervals to look back
 */
export async function getRecentSnapshot(msInInterval = _MS_PER_DAY, nIntervals = _DAYS_PER_WEEK) {
    let storageObjs = await getStorageObjs();
    filterStorageObjs(storageObjs, msInInterval, nIntervals);
    return storageObjs;
}

/**
 * An utility function for computing the size of a given snapshot.
 * @param {Object} storageObjs storage snapshot
 */
export function getSize(storageObjs) {
    let r = {}
    Object.entries(storageObjs).forEach(entry => {
        let key = entry[0];
        let value = entry[1];
        r[key] = Object.keys(value).length;
    })
    debugLog("number of entries " + JSON.stringify(r));
}
