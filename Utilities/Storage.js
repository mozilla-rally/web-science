import { localforage } from "/WebScience/dependencies/localforagees6.min.js"

// This module provides storage abstractions so that we can (relatively) easily
// swap out the underlying storage library (e.g., moving from localforage to Dexie)
// or ditch a storage library entirely

export class KeyValueStorage {

    constructor(storageAreaName) {
        this.storageAreaName = storageAreaName;
        this.storageInstance = null;
    }

    // Note that this initialization has to be separate from the constructor so it can
    // be asynchronous
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
        return this;
    }

    async get(key) {
        return await this.storageInstance.getItem(key);
    }

    async set(key, value) {
        await this.storageInstance.setItem(key, value);
    }

    async getContentsAsObject() {
        var output = { };
        await this.storageInstance.iterate((value, key, iterationNumber) => {
            output[key] = value;
        });
        return output;
    }
}

KeyValueStorage.localForageInitialized = false; // workaround for static class variable

// Convenience class for maintaining counters (e.g., unique IDs)
export class Counter {

    constructor(counterName) {
        this.counterName = counterName;
        this.counterValue = 0;
    }

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

    get() {
        return this.counterValue;
    }

    async increment() {
        this.counterValue = this.counterValue + 1;
        await Counter.storage.set(this.counterName, this.counterValue);
    }

    async getAndIncrement() {
        await this.increment();
        return this.counterValue;
    }

    static async getContentsAsObject() {
        return await Counter.storage.getContentsAsObject();
    }
}

// Workaround for static class variable
Counter.storage = null;

// Prevents IndexedDB data from getting deleted without user intervention
// Ignoring the promise resolution because we still want to use storage
// even if Firefox won't guarantee persistence
navigator.storage.persist();