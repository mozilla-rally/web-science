/**
 * This module enables running measurements and interventions with randomization,
 * such as A/B tests, multivariate tests, and randomized controlled trials.
 * 
 * @module randomization
 */

import * as permissions from "./permissions.js";

/**
 * A condition for a measurement or intervention that can be randomly selected.
 * @typedef {Object} Condition
 * @property {string} name - A name that uniquely identifies the condition within
 * the set of conditions.
 * @property {number} weight - The positive weight to give this condition when randomly
 * selecting a condition from a set.
 */

/**
 * @typedef {Object} ConditionSet
 * @property {string} name - A name that uniquely identifies the set of conditions.
 * @property {Condition[]} conditions - The conditions in the set.
 */

/**
 * A map of condition set names to condition names. Maintaining a cache avoids
 * storage race conditions. The cache is an Object rather than a Map so it can
 * be easily stored in extension local storage.
 * @type {Object|null}
 * @private
 */
let conditionCache = null;

/**
 * A unique key for storing selected conditions in extension local storage.
 * @constant {string}
 * @private
 */
const storageKey = "webScience.randomization.conditions";

/**
 * Selects a condition from a set of conditions. If a condition has previously
 * been selected from the set, that same condition will be returned. If not,
 * a condition will be randomly selected according to the provided weights.
 * @param {ConditionSet} conditionSet - The set of conditions.
 * @returns {string} - The name of the selected condition in the condition set.
 * @example
 * // on first run, returns "red" with 0.5 probability and "blue" with 0.5 probability
 * // on subsequent runs, returns the same value as before
 * randomization.selectCondition({
 *   name: "color",
 *   conditions: [
 *     {
 *       name: "red",
 *       weight: 1
 *     },
 *     {
 *       name: "blue",
 *       weight: 1
 *     }
 *   ]
 * });
 */
export async function selectCondition(conditionSet) {
    permissions.check({
        module: "webScience.linkExposure",
        requiredPermissions: [ "storage" ],
        suggestedPermissions: [ "unlimitedStorage" ]
    });
    
    // Initialize the cache of selected conditions
    if(conditionCache === null) {
        const retrievedConditions = await browser.storage.local.get(storageKey);
        // Check the cache once more, to avoid a race condition
        if(conditionCache === null) {
            if(storageKey in retrievedConditions)
                conditionCache = retrievedConditions[storageKey];
            else
                conditionCache = { };
        }
    }

    // Try to load the selected condition from the cache
    if(conditionSet.name in conditionCache)
        return conditionCache[conditionSet.name];

    // If there isn't a previously selected condition, select a condition,
    // save it to the cache and extension local storage, and return it 
    let totalWeight = 0;
    const conditionNames = new Set();
    if(!Array.isArray(conditionSet.conditions) || conditionSet.length === 0)
        throw "The condition set must include an array with at least one condition."
    for(const condition of conditionSet.conditions) {
        if(condition.weight <= 0)
            throw "Condition weights must be positive values."
        totalWeight += condition.weight;
        if(conditionNames.has(condition.name))
            throw "Conditions must have unique names."
        conditionNames.add(condition.name);
    }
    let randomValue = Math.random();
    let selectedCondition = "";
    for(const condition of conditionSet.conditions) {
        randomValue -= (condition.weight / totalWeight);
        if(randomValue <= 0) {
            selectedCondition = condition.name;
            break;
        }
    }
    conditionCache[conditionSet.name] = selectedCondition;
    // No need to wait for storage to complete
    browser.storage.local.set({ [storageKey]: conditionCache });
    return selectedCondition.repeat(1);
}
