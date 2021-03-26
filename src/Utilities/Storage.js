/**
 * This module provides convenient storage abstractions. Implementing storage in
 * a utility module, rather than directly calling browser storage APIs, avoids code
 * duplication and allows us to swap out the underlying storage implementation if
 * needed (e.g., switching from localforage to Dexie, or directly using browser
 * storage APIs).
 *
 * @module WebScience.Utilities.Storage
 */

import Dexie from 'dexie';

export const storageInstances = [];

export class IndexedStorage {
    /**
     * Create a storage area with indexed fields.
     * Storage is implemented with Dexie. The `stores` field specifies the Dexie tables to be created
     * and their indexed fields. See the Dexie documentation for syntax: https://dexie.org/docs/Version/Version.stores().
     * @param {string} storageAreaName - A name that uniquely identifies the storage area.
     * @param {Object} stores - The tables to be created, see Dexie documentation linked above.
     * @param {string} defaultStore - The table to use if one is not specified in future interactions.
     */
    constructor(storageAreaName, stores, defaultStore="") {
        this.storageAreaName = storageAreaName;
        this.defaultStore = defaultStore == "" ? Object.keys(stores)[0] : defaultStore;

        this.storageInstance = new Dexie(this.storageAreaName);
        this.storageInstance.version(1).stores(stores);
    }

    async set(item, store="") {
        await this.storageInstance[store === "" ? this.defaultStore : store].put(item);
    }

    async get(key, store="") {
        const result = await this.storageInstance[store == "" ? this.defaultStore : store].get(key);
        return result;
    }

    async getEventsByRange(startTime, endTime, timeKey, store=""){
        const result = await this.storageInstance[store=="" ? this.defaultStore : store].where(timeKey)
            .inAnyRange([[startTime, endTime]])
            .toArray();
        return result;
    }

}

/**
 * Class for a key-value storage area, where the key is a string and the value can have
 * any of a number of basic types.
 */
export class KeyValueStorage {
    /**
     * Create a key-value storage area. Only a name for the storage area is required.
     * Storage is implemented using the Dexie wrapper for IndexedDB. Clients that wish to
     * have multiple independent Dexie stores within this storage area can specify them with
     * the `storeNames` parameter. If none are specified, the module will create a default store
     * and use that store for future interactions.
     * @param {string} storageAreaName - A name that uniquely identifies the storage area.
     * @param {Array<string>} storeNames - A list of names of stores.
     * @param {string} defaultStore - If store names are given, which one should be the default in future interactions.
     * @example var exampleStorage = await (new KeyValueStorage("exampleName"));
     */
    constructor(storageAreaName, storeNames=["default"], defaultStore = "") {
        this.storageAreaName = storageAreaName;
        const stores = {};
        for (const storeName in storeNames) stores[storeNames[storeName]] = "key";

        this.defaultStore = defaultStore === "" ? Object.keys(stores)[0] : defaultStore;

        this.storageInstance = new Dexie(this.storageAreaName);
        this.storageInstance.version(1).stores(stores);
        return this;
    }

    /**
     * Get a value from storage.
     * @param {string} key - The key to use in the storage area.
     * @param {string} store - The name of the store from which to access the key
     * @returns {Promise<Array>|Promise<ArrayBuffer>|Promise<Blob>|Promise<Float32Array>|Promise<Float64Array>|
     * Promise<Int8Array>|Promise<Int16Array>|Promise<Int32Array>|Promise<Number>|Promise<Object>|Promise<Uint8Array>|
     * Promise<Uint8ClampedArray>|Promise<Uint16Array>|Promise<Uint32Array>|Promise<string>} The value in the
     * storage area for the key, or `null` if the key is not in storage.
     */
    async get(key, store="") {
        const result = await this.storageInstance[store == "" ? this.defaultStore : store].get(key);
        if (result) return result.value;
        return null;
    }

    /**
     * Set a value in storage.
     * @param {string} key - The key to use in the storage area.
     * @param {(Array|ArrayBuffer|Blob|Float32Array|Float64Array|Int8Array|Int16Array|Int32Array|
     * Number|Object|Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|string)} value - The value
     * to store in the storage area for the key.
     * @param {string} store - The name of the store where the pair should be placed
     */
    async set(key, value, store="") {
        await this.storageInstance[store == "" ? this.defaultStore : store].put({key: key, value: value});
    }

    /**
     * Create an object where with a property-value pair for each key-value pair in the storage area.
     * Note that this could be slow and consume excessive memory if the storage area contains a lot
     * of data.
     * @param {string} The store whose contents to return
     * @returns {Promise<Object>} An object that reflects the content in the storage area.
     */
    async getContentsAsObject(store="") {
        const storeToAccess = this.storageInstance[store == "" ? this.defaultStore : store];
        const output = { };
        storeToAccess.each(async (object) => {
            output[object.key] = object.value;
        });

        return output;
    }
}

/** Class for maintaining persistent counters (e.g., unique IDs). */
export class Counter {
    /**
     * Create a persistent counter. Note that, because creating a counter
     * requires asynchronous calls (which cannot happen in a constructor),
     * the counter will not be setup until a subsequent call to `initialize()`.
     * @param {string} counterName - A name that uniquely identifies the counter.
     * @example var exampleCounter = await (new Counter("exampleName")).initialize();
     */
    constructor(counterName) {
        this.counterName = counterName;
        this.counterValue = 0;
    }

    /**
     * Complete creation of the persistent counter. Returns itself for convenience.
     * @returns {Object} The persistent counter.
     */
    async initialize() {
        if(Counter.storage == null)
            Counter.storage = new KeyValueStorage("WebScience.Utilities.Storage.Counter");
        const initialCounterValue = await Counter.storage.get(this.counterName);
        if(initialCounterValue != null)
            this.counterValue = initialCounterValue;
        else
            await Counter.storage.set(this.counterName, this.counterValue);
        return this;
    }

    /**
     * Get the current value of the counter. The value is cached in memory, which allows
     * this function to be synchronous.
     * @returns {number} The current value of the counter.
     */
    get() {
        return this.counterValue;
    }

    /**
     * Increment the value of the counter by a number and return the incremented value.
     * The cached counter value is synchronously incremented; the stored
     * counter value is asynchronously incremented.
     * @param {number} incrementValue - The amount to increment the counter.
     * @returns {Promise<number>} - The counter value after incrementing.
     */
    async incrementByAndGet(incrementValue) {
        const currentCounterValue = (this.counterValue = this.counterValue + incrementValue);
        await Counter.storage.set(this.counterName, this.counterValue);
        return currentCounterValue;
    }

    /**
     * Increment the value of the counter, ignoring the value. Identical to
     * the Promise returned by `counter.incrementByAndGet.then(value => return)`.
     * @param {number} incrementValue - The amount to increment the counter.
     */
    async incrementBy(incrementValue) {
        await this.incrementByAndGet(incrementValue);
        return;
    }

    /**
     * Increment the value of the counter and return the incremented value.
     * The cached counter value is synchronously incremented; the stored
     * counter value is asynchronously incremented.
     * @returns {Promise<number>} - The counter value after incrementing.
     */
    async incrementAndGet() {
        // Saving the current counter value to avoid race conditions during
        // the asynchronous save to storage
        const currentCounterValue = (this.counterValue = this.counterValue + 1);
        await Counter.storage.set(this.counterName, this.counterValue);
        return currentCounterValue;
    }

    /**
     * Increment the value of the counter and return the value prior to
     * incrementing. Identical to the Promise returned by
     * `counter.incrementAndGet().then(value => return value - 1)`.
     * @returns {Promise<number>} - The counter value before incrementing.
     */
    async getAndIncrement() {
        const ret = await this.incrementAndGet() - 1;
        return ret;
    }

    /**
     * Increment the value of the counter, ignoring the value. Identical to
     * the Promise returned by `counter.incrementAndGet.then(value => return)`.
     */
    async increment() {
        await this.incrementAndGet();
        return;
    }

    async getAndReset() {
        const currentCounterValue = this.counterValue;
        this.counterValue = 0;
        await Counter.storage.set(this.counterName, this.counterValue);
        return currentCounterValue;
    }

    /**
     * Create an object with a property-value pair for each counter name-value pair.
     * @returns {Promise<Object>} An object that reflects the set of counters.
     */
    static async getContentsAsObject() {
        return await Counter.storage.getContentsAsObject();
    }
}

export async function getEventsByRange(startTime, endTime, instances) {
    const events = {};
    for (const instance of instances) {
        const storage = instance.storage;
        const store = instance.store;
        const timeKey = instance.timeKey;
        events[instance.storage.storageAreaName + "." + store] = await storage.getEventsByRange(startTime, endTime, timeKey, store);
    }
    return events;
}

// Workaround for static class variable
Counter.storage = null;

// Prevents IndexedDB data from getting deleted without user intervention
// Ignoring the promise resolution because we still want to use storage
// even if Firefox won't guarantee persistence
navigator.storage.persist();
