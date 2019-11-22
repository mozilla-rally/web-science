import { localforage } from "/WebScience/dependencies/localforagees6.min.js"

// This module provides storage abstractions so that we can (relatively) easily
// swap out the underlying storage library (e.g., moving from localforage to Dexie)
// or ditch a storage library entirely

export class KeyValueStorage {
    storageAreaName = "";
    storageInstance = null;

    constructor(storageAreaName) {
        this.storageAreaName = storageAreaName;
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
    counterName = "";
    counterValue = 0;

    constructor(counterName) {
        this.counterName = counterName;
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

    async getAndIncrement() {
        this.counterValue = this.counterValue + 1;
        Counter.storage.set(this.counterName, this.counterValue);
        return this.counterValue - 1;
    }

    static async getContentsAsObject() {
        return await Counter.storage.getContentsAsObject();
    }
}

Counter.storage = null; // workaround for static class variable
