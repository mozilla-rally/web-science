/**
 * This module provides convenient storage abstractions on top of extension local
 * storage. These abstractions minimize code duplication and opportunities for
 * error, and allow us to switch the underlying storage implementation in future.
 * 
 * Rally studies are welcome to choose any WebExtensions compatible storage option,
 * including this module, extension local storage, IndexedDB, or an IndexedDB wrapper
 * (e.g., Dexie.js).
 * 
 * @see {@link https://dexie.org/}
 * @module storage
 */

import * as permissions from "./permissions.js";

/**
 * Whether permissions have been checked for the module.
 * @type {boolean}
 * @private
 */
let checkedPermissions = false;

/**
 * Check permissions for the module.
 * @private
 */
function checkPermissions() {
    if(checkedPermissions) {
        return;
    }
    checkedPermissions = true;
    permissions.check({
        module: "webScience.storage",
        requiredPermissions: [ "storage" ],
        suggestedPermissions: [ "unlimitedStorage" ]
    });
}

/**
 * Create a key-value storage area.
 * @param {string} storageAreaName - A name that uniquely identifies the storage area.
 * @returns {KeyValueStorage} The new KeyValueStorage object.
 * @example const exampleStorage = webScience.storage.createKeyValueStorage("exampleName");
 */
export function createKeyValueStorage(storageAreaName) {
    checkPermissions();
    return new KeyValueStorage(storageAreaName);
}

/**
 * Class for a key-value storage area, where the key is a string and the value can have
 * any of a number of basic types. The class is modeled on the built-in Map type, but
 * backed by persistent storage and using Promise return values. Create instances of the
 * class with `createKeyValueStorage`.
 * @hideconstructor
 */
class KeyValueStorage {
    /**
     * Create a key-value storage area. Storage is implemented with extension local storage.
     * @param {string} storageAreaName - A name that uniquely identifies the storage area.
     */
    constructor(storageAreaName) {
        this.storageAreaName = storageAreaName;
        return this;
    }

    /**
     * Convert a key used in a storage area to a key in extension local storage. 
     * @param {string} key - The key used in the storage area.
     * @returns {string} A key in extension local storage.
     * @private
     */
    keyToExtensionLocalStorageKey(key) {
        return `webScience.storage.keyValueStorage.${this.storageAreaName}.${key}`;
    } 

    /**
     * Get a value from storage by its key.
     * @param {string} key - The key to use in the storage area.
     * @returns {Promise} A Promise that resolves to the key's value in the storage
     * area, or null if the key is not in the storage area. Note that this is slightly
     * different behavior from Map, which returns undefined if a key is not present.
     */
    async get(key) {
        const storageResult = await browser.storage.local.get({ [this.keyToExtensionLocalStorageKey(key)]: null });
        return storageResult[this.keyToExtensionLocalStorageKey(key)];
    }

    /**
     * Set a key-value pair in storage.
     * @param {string} key - The key to use in the storage area.
     * @param {*} value - The value to store in the storage area for the key.
     */
    async set(key, value) {
        await browser.storage.local.set({ [this.keyToExtensionLocalStorageKey(key)]: value });
    }

    /**
     * Check whether a key is associated with a value in the storage area.
     * @param {string} key - The key to use in the storage area.
     * @returns {Promise<boolean>} Whether the key is associated with a value in the
     * storage area.
     */
    async has(key) {
        const extensionLocalStorageKey = this.keyToExtensionLocalStorageKey(key);
        const storageResult = await browser.storage.local.get(extensionLocalStorageKey);
        return extensionLocalStorageKey in storageResult;
    }

    /**
     * Delete a key-value pair from storage.
     * @param {string} key - The key to use in the storage area.
     * @returns {Promise<boolean>} Whether the key was in use in the storage area.
     */
    async delete(key) {
        const hadKey = await this.has(key);
        if(hadKey) {
            await browser.storage.local.remove(key);
        }
        return hadKey;
    }

    /**
     * Convert the storage area into an object. Note that this function
     * loads and iterates all key-value pairs in extension local storage,
     * so it may have performance implications.
     * @returns {Promise<Object>} A promise that resolves to an object
     * where properties are keys in the storage area and values are stored
     * values.
     */
    async toObject() {
        const storagePrefix = this.keyToExtensionLocalStorageKey("");
        const storageEntries = await browser.storage.local.get();
        const outputEntries = { };
        for(const key in storageEntries) {
            if(key.startsWith(storagePrefix)) {
                outputEntries[key.substring(storagePrefix.length)] = storageEntries[key];
            }
        }
        return outputEntries;
    }

    /**
     * Create an iterator over key-value pairs in the storage area. Note
     * that this function loads and iterates all key-value pairs in extension
     * local storage, so it may have performance implications.
     * @returns {Promise<Object>} A Promise that resolves to an iterator over
     * the key-value pairs in the storage area.
     */
    async entries() {
        return Object.entries(await this.toObject()).values();
    }

    /**
     * Create an iterator over keys in the storage area. Note that this
     * function loads and iterates all key-value pairs in extension local
     * storage, so it may have performance implications.
     * @returns {Promise<Object>} A Promise that resolves to an iterator over
     * the keys in the storage area.
     */
    async keys() {
        return Object.keys(await this.toObject()).values();
    }

    /**
     * Create an iterator over values in the storage area. Note that this
     * function loads and iterates all key-value pairs in extension local
     * storage, so it may have performance implications.
     * @returns {Promise<Object>} A Promise that resolves to an iterator over the
     * values in the storage area.
     */
    async values() {
        return Object.values(await this.toObject()).values();
    }

    /**
     * Clear all key-value pairs in the storage area. Note that this
     * function loads and iterates all key-value pairs in extension local
     * storage, so it may have performance implications.
     */
    async clear() {
        const storagePrefix = this.keyToExtensionLocalStorageKey("");
        const storageEntries = await browser.storage.local.get();
        const keysToRemove = [ ];
        for(const key in storageEntries) {
            if(key.startsWith(storagePrefix)) {
                keysToRemove.push(key);
            }
        }
        await browser.storage.local.remove(keysToRemove);
    }
}

/**
 * Create a persistent counter.
 * @param {string} counterName - A name that uniquely identifies the counter.
 * @returns {Promise<Counter>} A Promise that resolves to the new Counter object.
 */
export async function createCounter(counterName) {
    checkPermissions();
    const counter = new Counter(counterName);
    await counter.initialize();
    return counter;
}

/**
 * Class for maintaining persistent counters (e.g., unique IDs). Create instances of the
 * class with `createCounter`.
 * @hideconstructor
 */
class Counter {
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
     * @private
     */
    async initialize() {
        if(Counter.storage === null) {
            Counter.storage = new KeyValueStorage("webScience.storage.counter");
        }
        const initialCounterValue = await Counter.storage.get(this.counterName);
        if(initialCounterValue !== null) {
            this.counterValue = initialCounterValue;
        }
        else {
            await Counter.storage.set(this.counterName, this.counterValue);
        }
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
}

// Workaround for static class variable
Counter.storage = null;
