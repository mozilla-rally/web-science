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

const debugLog = getDebuggingLog("Utilities.StorageManager");


/**
 * An object that stores the timestamp field for the storage modules.
 * @private
 * @constant
 */

/**
 * Extracts a snapshot of the current storage across the study.
 * Modifications to the snapshot will not affect the underlying persisted storage.
 *
 * @returns {Object} an object with module name as key and copy of current
 * storage as value
 */
/*
async function getStorageObjs() {
    const stats = {};
    await Promise.all(storageInstances.map(async instance => {
        const key = instance.storageAreaName;
        const storageObj = await instance.getContentsAsObject();
        stats[key] = storageObj;
    }));
    return stats;
}
*/

/**
 * Inclusive on start, exclusive on end
 */
/*
function filterEventsByRange(obj, timeProperty, startTime, endTime) {
    return Object.keys(obj).reduce((acc, val) => {
        if (!(timeProperty in obj[val])) {
            return { ...acc,
                   [val]: obj[val]};
        }
        if (startTime <= obj[val][timeProperty] &&
            obj[val][timeProperty] < endTime) {
            return {...acc, [val]: obj[val]};
        }
        return acc;
    }, {});
}
*/

/**
 * Modify the snapshot to include only the most recent data
 * Uses time property defined in `timePropertyMapping`.
 *
 * @param {Object} storageObjs Snapshot of storage
 * @param {number} msInInterval Width of interval measured in milliseconds
 * @param {number} nIntervals number of intervals to look back
 */
/*
function filterStorageObjs(storageObjs, startTime, endTime) {
    Object.entries(storageObjs).forEach(entry => {
        const key = entry[0];
        const value = entry[1];
        if (key in timePropertyMapping) {
            const filteredEvents = filterEventsByRange(value, timePropertyMapping[key], startTime, endTime);
            storageObjs[key] = filteredEvents;
        }
    });
}
*/

export async function getEventsByRange(startTime, endTime, instances) {
    const events = {};
    for (const instance of instances) {
        const storage = instance.storage;
        const store = instance.store;
        const timeKey = instance.timeKey;
        events[instance.storage.storageAreaName] = await storage.getEventsByRange(startTime, endTime, timeKey, store);
    }
    return events;
}

/**
 * An utility function for computing the size of a given snapshot.
 * @param {Object} storageObjs storage snapshot
 */
export function getSize(storageObjs) {
    const r = {}
    Object.entries(storageObjs).forEach(entry => {
        const key = entry[0];
        const value = entry[1];
        r[key] = Object.keys(value).length;
    })
    debugLog("number of entries " + JSON.stringify(r));
}
