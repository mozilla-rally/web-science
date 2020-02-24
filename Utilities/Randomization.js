/**
 * This module enables running measurements and interventions with randomization,
 * such as A/B tests, multivariate tests, and randomized controlled trials.
 * 
 * @module WebScience.Utilities.Randomization
 */

import * as Storage from "./Storage.js"

/**
 * A condition for a measurement or intervention that can be randomly selected.
 * @typedef {Object} RandomCondition
 * @property {string} name - A name that uniquely identifies the `RandomCondition`
 * within each `RandomConditionSelector`.
 * @property {function} callback - A function for executing the condition.
 * @property {number} weight - The weight to give this condition when randomly
 * selecting a condition.
 */

/** 
 * Class for triggering a random condition in a measurement or intervention. The
 * condition is randomly selected (accounting for provided weights) when the
 * class is first instantiated and saved in persistent storage. Subsequent
 * executions will always run the same condition.
 */
export class RandomConditionSelector {
    /**
     * Create a `RandomConditionSelector` object. Note that, because loading from and saving
     * to storage require asynchronous calls (which cannot happen in a constructor), the
     * class will not be setup until a subsequent call to `initialize()`.
     * @param {string} name - A name that uniquely identifies this `RandomConditionSelector`.
     * @param {Iterable<RandomCondition>} conditions - An `Iterable` containing the conditions
     * to randomly select from.
     * @example var exampleRandomConditionSelector = await (new RandomConditionSelector(name, conditions)).initialize();
     */
    constructor(name, conditions) {
        this.name = name;
        this.conditions = conditions;
        this.initialized = false;
        this.storage = null;
        this.selectedCondition = null;
    }

    /** 
     * Complete creation of the storage area. Returns itself for convenience.
     * @returns {Object} The key-value storage area.
     */
    async initialize() {
        if(this.initialized)
            return;
        this.initialized = true;

        this.storage = await (new Storage.KeyValueStorage("WebScience.Utilities.Randomization.RandomConditionSelector")).initialize();

        // Try to load the selected condition from storage
        var selectedConditionName = await this.storage.get(this.name);
        if(typeof selectedConditionName === "string") {
            for(const condition of this.conditions)
                if(condition.name === selectedConditionName) {
                    this.selectedCondition = condition;
                    break;
                }
            if(typeof this.selectedCondition !== "object")
                throw "Unable to match RandomConditionSelector condition in storage to provided conditions."
            return this;
        }

        // Otherwise select a random condition and persist it
        var totalWeight = 0;
        var conditionNameSet = new Set();
        for(const condition of this.conditions) {
            if(condition.weight <= 0)
                throw "Negative condition weight in RandomConditionSelector condition."
            totalWeight = totalWeight + condition.weight;
            if(conditionNameSet.has(condition.name))
                throw "Duplicate condition name in RandomConditionSelector provided conditions."
            conditionNameSet.add(condition.name);
        }
        if(totalWeight <= 0)
            throw "Negative or zero sum of condition weights in RandomConditionSelector provided conditions."
        var randomValue = Math.random();
        for(const condition of this.conditions) {
            randomValue = randomValue - (condition.weight / totalWeight);
            if(randomValue <= 0) {
                this.selectedCondition = condition;
                break;
            }
        }
        await this.storage.set(this.name, this.selectedCondition.name);

        // Don't need the storage area or set of conditions anymore
        this.storage = null;
        this.conditions = null;

        return this;
    }

    /**
     * Get the name of the randomly selected condition.
     * @returns {string} - The name of the randomly selected condition.
     */
    getConditionName() {
        return this.selectedCondition.name.repeat(1);
    }

    /**
     * Get the callback function for the randomly selected condition.
     * @returns {function} - The callback function for the randomly
     * selected condition.
     */
    getConditionCallback() {
        return this.selectedCondition.callback;
    }

    /**
     * Execute the callback function for the randomly selected condition,
     * using the given parameters and returning the callback return value.
     * This is a convenience function, identical to calling
     * `(RandomConditionSelector.getConditionCallback())(...)`.
     */
    executeCondition(...args) {
        return (this.selectedCondition.callback).apply(null, args);
    }
}
