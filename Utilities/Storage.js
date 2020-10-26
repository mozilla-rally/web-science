/**
 * This module provides convenient storage abstractions. Implementing storage in
 * a utility module, rather than directly calling browser storage APIs, avoids code
 * duplication and allows us to swap out the underlying storage implementation if
 * needed (e.g., switching from localforage to Dexie, or directly using browser
 * storage APIs).
 *
 * @module WebScience.Utilities.Storage
 */

// Currently implemented with localforage
import { localforageKeysStartingWith, localforage } from "../dependencies/localforage-startswith.js"

export var storageInstances = [];
/**
 * Class for a key-value storage area, where the key is a string and the value can have
 * any of a number of basic types.
 */
export class KeyValueStorage {
    /**
     * Create a key-value storage area. Note that, because creating a storage area
     * requires asynchronous calls (which cannot happen in a constructor), the
     * storage area will not be setup until a subsequent call to `initialize()`.
     * @param {string} storageAreaName - A name that uniquely identifies the storage area.
     * @example var exampleStorage = await (new KeyValueStorage("exampleName")).initialize();
     */
    constructor(storageAreaName) {
        this.storageAreaName = storageAreaName;
        this.storageInstance = null;
    }

    /**
     * Complete creation of the storage area. Returns itself for convenience.
     * @returns {Object} The key-value storage area.
     */
    async initialize() {
        if(!KeyValueStorage.localForageInitialized) {
            await localforage.config({
                driver: [localforage.INDEXEDDB,
                        localforage.WEBSQL,
                        localforage.LOCALSTORAGE],
            });
            KeyValueStorage.localForageInitialized = true;
        }
        this.storageInstance = localforage.createInstance( { name: this.storageAreaName } );
        storageInstances.push(this);
        return this;
    }

    /**
     * Get a value from storage.
     * @param {string} key - The key to use in the storage area.
     * @returns {Promise<Array>|Promise<ArrayBuffer>|Promise<Blob>|Promise<Float32Array>|Promise<Float64Array>|
     * Promise<Int8Array>|Promise<Int16Array>|Promise<Int32Array>|Promise<Number>|Promise<Object>|Promise<Uint8Array>|
     * Promise<Uint8ClampedArray>|Promise<Uint16Array>|Promise<Uint32Array>|Promise<string>} The value in the
     * storage area for the key, or `null` if the key is not in storage.
     */
    async get(key) {
        return await this.storageInstance.getItem(key);
    }

    /**
     * Set a value in storage.
     * @param {string} key - The key to use in the storage area.
     * @param {(Array|ArrayBuffer|Blob|Float32Array|Float64Array|Int8Array|Int16Array|Int32Array|
     * Number|Object|Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|string)} value - The value
     * to store in the storage area for the key.
     */
    async set(key, value) {
        await this.storageInstance.setItem(key, value);
    }

    /**
     * Create an object where with a property-value pair for each key-value pair in the storage area.
     * Note that this could be slow and consume excessive memory if the storage area contains a lot
     * of data.
     * @returns {Promise<Object>} An object that reflects the content in the storage area.
     */
    async getContentsAsObject() {
        var output = { };
        await this.storageInstance.iterate((value, key, iterationNumber) => {
            output[key] = value;
        });
        return output;
    }

    /**
     * @callback iterator
     * @param {(Array|ArrayBuffer|Blob|Float32Array|Float64Array|Int8Array|Int16Array|Int32Array|
     * Number|Object|Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|string)} value
     * @param {string} key
     * @param {number} iterationNumber
     */
    /**
     * Iterate over all the entries in the storage area. Note that iteration
     * will stop if `callback` returns anything non-`undefined`.
     *
     * As long as we're using LocalForage, this is easy and presumably not
     * memory-intensive, as long as the callback isn't storing all of the entires.
     * @param {iterator} callback - function called on each key-value pair
     * @returns {Promise}
     */
    iterate(callback) {
        return this.storageInstance.iterate(callback);
    }

    async keysStartingWith(keyPrefix) {
        return this.storageInstance.keysStartingWith(keyPrefix);
    }

    async startsWith(keyPrefix) {
        return this.storageInstance.startsWith(keyPrefix);
    }
}

KeyValueStorage.localForageInitialized = false; // workaround for static class variable

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
            Counter.storage = await (new KeyValueStorage("WebScience.Utilities.Storage.Counter")).initialize();
        var initialCounterValue = await Counter.storage.get(this.counterName);
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

    async incrementByAndGet(incValue) {
        var currentCounterValue = (this.counterValue = this.counterValue + incValue);
        await Counter.storage.set(this.counterName, this.counterValue);
        return currentCounterValue;
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
        var currentCounterValue = (this.counterValue = this.counterValue + 1);
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
        var ret = await this.increment() - 1;
        return ret;
    }

    /**
     * Increment the value of the counter, ignoring the value. Identical to
     * the Promise returned by `counter.incrementAndGet.then(value => return)`.
     */
    async increment() {
        return await this.incrementAndGet();
    }

    async getAndReset() {
        var currentCounterValue = this.counterValue;
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

export function normalizeUrl(url) {
    var urlObj = new URL(url);
    var normalizedUrl = (urlObj.protocol ? urlObj.protocol : "https:") + 
                        "//" + urlObj.hostname + 
                        (urlObj.pathname ? urlObj.pathname : "");
    return normalizedUrl;
}

// Workaround for static class variable
Counter.storage = null;

// Prevents IndexedDB data from getting deleted without user intervention
// Ignoring the promise resolution because we still want to use storage
// even if Firefox won't guarantee persistence
navigator.storage.persist();
