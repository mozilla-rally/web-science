/**
 * This module provides convenient storage abstractions on top of extension local
 * storage. These abstractions minimize code duplication and opportunities for
 * error, and allow us to switch the underlying storage implementation in future.
 *
 * @module webScience.storage
 */

import * as permissions from "./permissions.js";

permissions.check({
    module: "webScience.storage",
    requiredPermissions: [ "storage" ],
    suggestedPermissions: [ "unlimitedStorage" ]
});

/**
 * Create a key-value storage area.
 * @param {string} storageAreaName - A name that uniquely identifies the storage area.
 * @returns {KeyValueStorage} The new KeyValueStorage object.
 * @example const exampleStorage = createKeyValueStorage("exampleName"));
 */
export function createKeyValueStorage(storageAreaName) {
    return new KeyValueStorage(storageAreaName);
}

/**
 * Class for a key-value storage area, where the key is a string and the value can have
 * any of a number of basic types.
 */
class KeyValueStorage {
    /**
     * Create a key-value storage area. Storage is implemented with extension local storage.
     * @param {string} storageAreaName - A name that uniquely identifies the storage area.
     * @private
     */
    constructor(storageAreaName) {
        this.storageAreaName = storageAreaName;
        return this;
    }

    /**
     * Convert a key used in a storage area to a key in extension local storage. 
     * @param {string} key - The key used in the storage area.
     * @returns {string} A key in extension local storage.
     */
    keyToExtensionLocalStorageKey(key) {
        return `webScience.storage.keyValueStorage.${this.storageAreaName}.${key}`;
    } 

    /**
     * Get a value from storage.
     * @param {string} key - The key to use in the storage area.
     * @returns {*} The value in the storage area, or null if the value is not
     * in the storage area.
     */
    async get(key) {
        const storageResult = await browser.storage.local.get({ [this.keyToExtensionLocalStorageKey(key)]: null });
        return storageResult[this.keyToExtensionLocalStorageKey(key)];
    }

    /**
     * Set a value in storage.
     * @param {string} key - The key to use in the storage area.
     * @param {*} value - The value to store in the storage area for the key.
     */
    async set(key, value) {
        await browser.storage.local.set({ [this.keyToExtensionLocalStorageKey(key)]: value });
    }
}

/**
 * Create a persistent counter.
 * @param {string} counterName - A name that uniquely identifies the counter.
 * @returns {Counter} The new Counter object.
 */
export async function createCounter(counterName) {
    const counter = new Counter(counterName);
    await counter.initialize();
    return counter;
}

/**
 * Class for maintaining persistent counters (e.g., unique IDs).
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
